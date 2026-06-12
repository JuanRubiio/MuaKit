const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const STATUSES = new Set(["pending", "processing", "ready", "review", "error", "confirmed", "discarded"]);

function json(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function registerExpenseImportRoutes(app, ctx) {
  const { query, one, exec, insert, saveDb, audit, badRequest, notFound, upload, fs, path, UPLOAD_DIR, documentExtraction } = ctx;

  function purgeImport(item) {
    exec("BEGIN TRANSACTION");
    try {
      audit("expense_import", Number(item.id), "delete", item, { document_id: item.document_id, original_name: item.original_name });
      exec("DELETE FROM expense_imports WHERE id=$id", { id: item.id });
      exec("DELETE FROM documents WHERE id=$id", { id: item.document_id });
      if (item.stored_path && fs.existsSync(item.stored_path)) fs.unlinkSync(item.stored_path);
      exec("COMMIT");
      saveDb();
    } catch (error) {
      exec("ROLLBACK");
      throw error;
    }
  }

  function payload(row) {
    if (!row) return null;
    return {
      ...row,
      confidence: Number(row.confidence || 0),
      detected_fields: json(row.detected_fields_json, {}),
      pages: json(row.pages_json, []),
      warnings: json(row.warnings_json, [])
    };
  }

  app.get("/api/expense-imports", (req, res) => {
    const status = req.query.status || "";
    res.json(query(`SELECT ei.*, d.original_name, d.stored_name, d.mime_type, d.size
      FROM expense_imports ei JOIN documents d ON d.id=ei.document_id
      WHERE ($status='' OR ei.status=$status) ORDER BY ei.created_at DESC, ei.id DESC`, { status }).map(payload));
  });

  app.post("/api/expense-imports", upload.fields([{ name: "documents", maxCount: 20 }, { name: "document", maxCount: 1 }]), (req, res) => {
    const files = [...(req.files?.documents || []), ...(req.files?.document || [])];
    if (!files.length) return badRequest(res, "Falta al menos un documento.", "DOCUMENT_REQUIRED");
    const existingNames = new Set(query(`SELECT LOWER(d.original_name) name FROM documents d
      JOIN expense_imports ei ON ei.document_id=d.id
      WHERE ei.status!='discarded'`).map((row) => row.name));
    const batchNames = new Set();
    const accepted = [];
    const rejected = [];
    for (const file of files) {
      const normalizedName = String(file.originalname || "").trim().toLowerCase();
      if (!ALLOWED_TYPES.has(file.mimetype)) {
        fs.unlinkSync(file.path);
        rejected.push({ name: file.originalname, code: "DOCUMENT_TYPE_UNSUPPORTED", error: "Formato no permitido." });
        continue;
      }
      if (existingNames.has(normalizedName) || batchNames.has(normalizedName)) {
        fs.unlinkSync(file.path);
        rejected.push({ name: file.originalname, code: "EXPENSE_IMPORT_NAME_DUPLICATE", error: "Ya existe una factura importada con este nombre." });
        continue;
      }
      batchNames.add(normalizedName);
      const ext = path.extname(file.originalname);
      const storedName = `${Date.now()}-${file.filename}${ext}`;
      const finalPath = path.join(UPLOAD_DIR, storedName);
      fs.renameSync(file.path, finalPath);
      const documentId = insert(`INSERT INTO documents
        (original_name, stored_name, stored_path, mime_type, size, related_entity)
        VALUES ($original, $stored, $path, $mime, $size, 'expense_import')`, {
        original: file.originalname, stored: storedName, path: finalPath, mime: file.mimetype, size: file.size
      });
      const importId = insert("INSERT INTO expense_imports (document_id, status) VALUES ($document, 'pending')", { document: documentId });
      exec("UPDATE documents SET related_id=$import WHERE id=$document", { import: importId, document: documentId });
      audit("expense_import", importId, "upload", null, { document_id: documentId, original_name: file.originalname });
      accepted.push(payload(one("SELECT * FROM expense_imports WHERE id=$id", { id: importId })));
      documentExtraction.enqueue(importId);
    }
    saveDb();
    const rejectedOnlyStatus = rejected.some((item) => item.code === "EXPENSE_IMPORT_NAME_DUPLICATE") ? 409 : 400;
    res.status(accepted.length ? 202 : rejectedOnlyStatus).json({ accepted, rejected });
  });

  app.get("/api/expense-imports/health", (req, res) => {
    const counts = query("SELECT status, COUNT(*) count FROM expense_imports GROUP BY status");
    res.json({ ...documentExtraction.status(), counts });
  });

  app.get("/api/expense-imports/:id", (req, res) => {
    const item = one(`SELECT ei.*, d.original_name, d.stored_name, d.mime_type, d.size
      FROM expense_imports ei JOIN documents d ON d.id=ei.document_id WHERE ei.id=$id`, { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    const fields = json(item.detected_fields_json, {});
    const exactDuplicate = fields.suggested_supplier_id && fields.invoice_number
      ? one("SELECT id, invoice_number, invoice_date, total FROM invoices WHERE supplier_id=$supplier AND invoice_number=$number AND is_deleted=0", { supplier: fields.suggested_supplier_id, number: fields.invoice_number })
      : null;
    const warningDuplicate = fields.suggested_supplier_id && fields.invoice_date && fields.total !== null
      ? one("SELECT id, invoice_number, invoice_date, total FROM invoices WHERE supplier_id=$supplier AND invoice_date=$date AND ABS(total-$total)<0.01 AND is_deleted=0", { supplier: fields.suggested_supplier_id, date: fields.invoice_date, total: fields.total })
      : null;
    res.json({ import: payload(item), lines: query(`SELECT eil.*, m.name suggested_material_name FROM expense_import_lines eil LEFT JOIN materials m ON m.id=eil.suggested_material_id WHERE expense_import_id=$id ORDER BY position,id`, { id: req.params.id }), duplicates: { exact: exactDuplicate, warning: warningDuplicate } });
  });

  app.patch("/api/expense-imports/:id", (req, res) => {
    const before = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    const detected = { ...json(before.detected_fields_json, {}), ...(req.body.detected_fields || {}) };
    const status = STATUSES.has(req.body.status) ? req.body.status : before.status;
    exec("UPDATE expense_imports SET detected_fields_json=$fields, status=$status, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: req.params.id, fields: JSON.stringify(detected), status });
    audit("expense_import", Number(req.params.id), "review_update", before, { status, detected_fields: detected });
    saveDb();
    res.json(payload(one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id })));
  });

  app.patch("/api/expense-imports/:importId/lines/:lineId", (req, res) => {
    const before = one("SELECT * FROM expense_import_lines WHERE id=$id AND expense_import_id=$import", { id: req.params.lineId, import: req.params.importId });
    if (!before) return notFound(res, "Linea no encontrada", "EXPENSE_IMPORT_LINE_NOT_FOUND");
    const fields = ["description", "quantity", "unit_price", "line_total", "suggested_material_id", "human_decision"];
    const params = { id: req.params.lineId };
    const updates = [];
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) { updates.push(`${field}=$${field}`); params[field] = req.body[field] === "" ? null : req.body[field]; }
    });
    if (updates.length) exec(`UPDATE expense_import_lines SET ${updates.join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, params);
    audit("expense_import_line", Number(req.params.lineId), "review_update", before, req.body);
    saveDb();
    res.json(one("SELECT * FROM expense_import_lines WHERE id=$id", { id: req.params.lineId }));
  });

  app.post("/api/expense-imports/:id/reprocess", (req, res) => {
    const item = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    exec("UPDATE expense_imports SET status='pending', error_message='', updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: req.params.id });
    audit("expense_import", Number(req.params.id), "reprocess", item, { status: "pending" });
    saveDb();
    documentExtraction.enqueue(req.params.id);
    res.status(202).json({ ok: true });
  });

  app.post("/api/expense-imports/:id/discard", (req, res) => {
    const item = one(`SELECT ei.*, d.original_name, d.stored_path FROM expense_imports ei
      JOIN documents d ON d.id=ei.document_id WHERE ei.id=$id`, { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    if (item.status === "confirmed") return badRequest(res, "Una importacion confirmada no se puede eliminar.", "EXPENSE_IMPORT_CONFIRMED");
    purgeImport(item);
    res.json({ ok: true, deleted: true });
  });

  app.post("/api/expense-imports/:id/confirm", (req, res) => {
    const item = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    if (item.status === "confirmed") return badRequest(res, "La importacion ya fue confirmada.", "EXPENSE_IMPORT_ALREADY_CONFIRMED");
    const fields = { ...json(item.detected_fields_json, {}), ...(req.body.detected_fields || {}) };
    if (!fields.invoice_date || fields.total === null || fields.total === undefined) return badRequest(res, "Fecha y total son obligatorios.", "EXPENSE_IMPORT_FIELDS_REQUIRED");
    const exact = fields.suggested_supplier_id && fields.invoice_number
      ? one("SELECT id FROM invoices WHERE supplier_id=$supplier AND invoice_number=$number AND is_deleted=0", { supplier: fields.suggested_supplier_id, number: fields.invoice_number })
      : null;
    if (exact) return badRequest(res, "Ya existe una factura con ese proveedor y numero.", "EXPENSE_IMPORT_DUPLICATE");
    exec("BEGIN TRANSACTION");
    try {
      const invoiceId = insert(`INSERT INTO invoices
        (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, status, notes)
        VALUES ($supplier,$document,$number,$date,$category,$subtotal,$discount,$shipping,$tax,$total,$currency,'draft',$notes)`, {
        supplier: fields.suggested_supplier_id || null, document: item.document_id, number: fields.invoice_number || "", date: fields.invoice_date,
        category: fields.category || "materiales", subtotal: Number(fields.subtotal || fields.total || 0), discount: Number(fields.discount || 0),
        shipping: Number(fields.shipping || 0), tax: Number(fields.tax || 0), total: Number(fields.total || 0), currency: fields.currency || "EUR",
        notes: `Creada desde importacion supervisada #${item.id}`
      });
      const accepted = query("SELECT * FROM expense_import_lines WHERE expense_import_id=$id AND human_decision='accepted' ORDER BY position", { id: item.id });
      accepted.forEach((line) => insert(`INSERT INTO invoice_lines
        (invoice_id, material_id, description, package_count, units_per_package, total_units, unit_price, line_total, affects_stock, notes)
        VALUES ($invoice,$material,$description,1,$quantity,$quantity,$unitPrice,$total,1,'Importada con validacion humana')`, {
        invoice: invoiceId, material: line.suggested_material_id, description: line.description, quantity: Number(line.quantity || 1), unitPrice: line.unit_price, total: Number(line.line_total || 0)
      }));
      exec("UPDATE expense_imports SET status='confirmed', invoice_id=$invoice, detected_fields_json=$fields, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: item.id, invoice: invoiceId, fields: JSON.stringify(fields) });
      audit("expense_import", item.id, "confirm", item, { invoice_id: invoiceId, accepted_lines: accepted.length });
      exec("COMMIT");
      saveDb();
      res.json({ ok: true, invoice_id: invoiceId });
    } catch (error) {
      exec("ROLLBACK");
      throw error;
    }
  });

  for (const item of query(`SELECT ei.*, d.original_name, d.stored_path FROM expense_imports ei
    JOIN documents d ON d.id=ei.document_id WHERE ei.status='discarded'`)) purgeImport(item);
}

module.exports = { registerExpenseImportRoutes };
