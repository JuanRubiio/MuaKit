const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const STATUSES = new Set(["pending", "processing", "ready", "review", "error", "confirmed", "discarded"]);

function json(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function cleanOriginalName(value) {
  const original = String(value || "").trim();
  if (!/[ÃÂâ]/.test(original)) return original;
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  return (decoded.match(/[ÃÂâ�]/g) || []).length < (original.match(/[ÃÂâ�]/g) || []).length ? decoded : original;
}

function accountingQuality(fields, lines, duplicates = {}) {
  const required = ["suggested_supplier_id", "invoice_number", "invoice_date", "total", "category"];
  const missing = required.filter((key) => fields[key] === null || fields[key] === undefined || fields[key] === "");
  const activeLines = lines.filter((line) => line.human_decision !== "rejected");
  const acceptedLines = lines.filter((line) => line.human_decision === "accepted");
  const lineTotal = activeLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
  const subtotal = Number(fields.subtotal ?? fields.total ?? 0);
  const discount = Number(fields.discount || 0);
  const shipping = Number(fields.shipping || 0);
  const tax = Number(fields.tax || 0);
  const additionalTax = Number(fields.additional_tax || 0);
  const total = Number(fields.total || 0);
  const subtotalDifference = Number((lineTotal - subtotal).toFixed(2));
  const grossDifference = Number((lineTotal - total).toFixed(2));
  const totalWithoutAddedTax = Number((subtotal - discount + shipping).toFixed(2));
  const totalWithAddedTax = Number((totalWithoutAddedTax + tax + additionalTax).toFixed(2));
  const linesAreOptional = fields.category === "envios";
  const linesAreGross = activeLines.length > 0 && Math.abs(grossDifference) <= 0.02;
  const calculatedTotal = linesAreGross ? lineTotal : Math.abs(totalWithoutAddedTax - total) <= Math.abs(totalWithAddedTax - total) ? totalWithoutAddedTax : totalWithAddedTax;
  const totalDifference = Number((calculatedTotal - total).toFixed(2));
  const lineDifference = linesAreGross ? grossDifference : subtotalDifference;
  const linesMatch = linesAreOptional ? Math.abs(totalDifference) <= 0.02 : (activeLines.length > 0 && (linesAreGross || Math.abs(subtotalDifference) <= 0.02) && Math.abs(totalDifference) <= 0.02);
  const decisionsComplete = linesAreOptional || (activeLines.length > 0 && acceptedLines.length === activeLines.length);
  const duplicate = Boolean(duplicates.exact || duplicates.warning);
  const score = [!missing.length, linesMatch, decisionsComplete, !duplicate].filter(Boolean).length;
  return {
    score,
    tone: score === 4 ? "high" : score >= 2 ? "medium" : "low",
    missing,
    line_total: Number(lineTotal.toFixed(2)),
    difference: lineDifference,
    line_difference: lineDifference,
    total_difference: totalDifference,
    calculated_total: calculatedTotal,
    line_price_basis: linesAreGross ? "gross" : "net",
    subtotal,
    discount,
    shipping,
    tax,
    additional_tax: additionalTax,
    lines_match: linesMatch,
    decisions_complete: decisionsComplete,
    duplicate,
    batch_eligible: score === 4
  };
}

function qualityWarnings(quality) {
  const warnings = (quality?.missing || []).map((field) => `Falta ${field}.`);
  if (quality?.duplicate) warnings.push("Posible factura duplicada.");
  if (Math.abs(Number(quality?.total_difference || 0)) > 0.02) warnings.push("Los totales no cuadran.");
  if (!quality?.decisions_complete) warnings.push("Hay líneas pendientes de decisión.");
  return warnings;
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

  function detailFor(item) {
    const fields = json(item.detected_fields_json, {});
    const lines = query(`SELECT eil.*, m.name suggested_material_name FROM expense_import_lines eil LEFT JOIN materials m ON m.id=eil.suggested_material_id WHERE expense_import_id=$id ORDER BY position,id`, { id: item.id });
    const exact = fields.suggested_supplier_id && fields.invoice_number
      ? one(`SELECT i.id, i.invoice_number, i.invoice_date, i.total, i.currency, i.status, i.category, s.name supplier_name
        FROM invoices i LEFT JOIN suppliers s ON s.id=i.supplier_id
        WHERE i.supplier_id=$supplier AND i.invoice_number=$number AND i.id!=$invoice AND i.is_deleted=0`, { supplier: fields.suggested_supplier_id, number: fields.invoice_number, invoice: Number(item.invoice_id || 0) })
      : null;
    const warning = fields.suggested_supplier_id && fields.invoice_date && fields.total !== null
      ? one(`SELECT i.id, i.invoice_number, i.invoice_date, i.total, i.currency, i.status, i.category, s.name supplier_name
        FROM invoices i LEFT JOIN suppliers s ON s.id=i.supplier_id
        WHERE i.supplier_id=$supplier AND i.invoice_date=$date AND ABS(i.total-$total)<0.01 AND i.id!=$invoice AND i.is_deleted=0`, { supplier: fields.suggested_supplier_id, date: fields.invoice_date, total: fields.total, invoice: Number(item.invoice_id || 0) })
      : null;
    const duplicates = { exact, warning };
    const quality = accountingQuality(fields, lines, duplicates);
    const importPayload = { ...payload(item), warnings: qualityWarnings(quality) };
    return { import: importPayload, lines, duplicates, accounting_quality: quality };
  }

  function confirmImport(item, overrideFields = {}) {
    if (item.status === "confirmed") throw Object.assign(new Error("La importacion ya fue confirmada."), { code: "EXPENSE_IMPORT_ALREADY_CONFIRMED" });
    const fields = { ...json(item.detected_fields_json, {}), ...overrideFields };
    if (!fields.invoice_date || fields.total === null || fields.total === undefined) throw Object.assign(new Error("Fecha y total son obligatorios."), { code: "EXPENSE_IMPORT_FIELDS_REQUIRED" });
    const exact = fields.suggested_supplier_id && fields.invoice_number
      ? one("SELECT id FROM invoices WHERE supplier_id=$supplier AND invoice_number=$number AND is_deleted=0", { supplier: fields.suggested_supplier_id, number: fields.invoice_number })
      : null;
    if (exact) throw Object.assign(new Error("Ya existe una factura con ese proveedor y numero."), { code: "EXPENSE_IMPORT_DUPLICATE" });
    const invoiceId = insert(`INSERT INTO invoices
      (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, additional_tax, total, currency, status, notes)
      VALUES ($supplier,$document,$number,$date,$category, $subtotal,$discount,$shipping,$tax,$additionalTax,$total,$currency,'draft',$notes)`, {
      supplier: fields.suggested_supplier_id || null, document: item.document_id, number: fields.invoice_number || "", date: fields.invoice_date,
      category: fields.category || "materiales", subtotal: Number(fields.subtotal || fields.total || 0), discount: Number(fields.discount || 0),
      shipping: Number(fields.shipping || 0), tax: Number(fields.tax || 0), additionalTax: Number(fields.additional_tax || 0), total: Number(fields.total || 0), currency: fields.currency || "EUR",
      notes: `Creada desde importacion supervisada #${item.id}`
    });
    const accepted = query("SELECT * FROM expense_import_lines WHERE expense_import_id=$id AND human_decision='accepted' ORDER BY position", { id: item.id });
    accepted.forEach((line) => insert(`INSERT INTO invoice_lines
      (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, affects_stock, impressions, notes)
      VALUES ($invoice,$material,$description,$packages,$unitsPackage,$totalUnits,$pricePackage,$unitPrice,$total,1,$impressions,'Importada con validacion humana')`, {
      invoice: invoiceId, material: line.suggested_material_id, description: line.description,
      packages: Number(line.package_count || 1), unitsPackage: Number(line.units_per_package || line.quantity || 1),
      totalUnits: Number(line.total_units || line.quantity || 1), pricePackage: Number(line.price_per_package ?? line.line_total ?? 0),
      unitPrice: Number(line.unit_price ?? 0), total: Number(line.line_total || 0), impressions: line.impressions
    }));
    exec("UPDATE expense_imports SET status='confirmed', invoice_id=$invoice, detected_fields_json=$fields, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: item.id, invoice: invoiceId, fields: JSON.stringify(fields) });
    audit("expense_import", item.id, "confirm", item, { invoice_id: invoiceId, accepted_lines: accepted.length });
    return invoiceId;
  }

  app.get("/api/expense-imports", (req, res) => {
    const status = req.query.status || "";
    res.json(query(`SELECT ei.*, d.original_name, d.stored_name, d.mime_type, d.size
      FROM expense_imports ei JOIN documents d ON d.id=ei.document_id
      WHERE ($status='' OR ei.status=$status) ORDER BY ei.created_at DESC, ei.id DESC`, { status }).map((row) => {
        const detail = detailFor(row);
        return { ...detail.import, accounting_quality: detail.accounting_quality, duplicate: Boolean(detail.duplicates.exact || detail.duplicates.warning) };
      }));
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
      const originalName = cleanOriginalName(file.originalname);
      const normalizedName = originalName.toLowerCase();
      if (!ALLOWED_TYPES.has(file.mimetype)) {
        fs.unlinkSync(file.path);
        rejected.push({ name: originalName, code: "DOCUMENT_TYPE_UNSUPPORTED", error: "Formato no permitido." });
        continue;
      }
      if (existingNames.has(normalizedName) || batchNames.has(normalizedName)) {
        fs.unlinkSync(file.path);
        rejected.push({ name: originalName, code: "EXPENSE_IMPORT_NAME_DUPLICATE", error: "Ya existe una factura importada con este nombre." });
        continue;
      }
      batchNames.add(normalizedName);
      const ext = path.extname(originalName);
      const storedName = `${Date.now()}-${file.filename}${ext}`;
      const finalPath = path.join(UPLOAD_DIR, storedName);
      fs.renameSync(file.path, finalPath);
      const documentId = insert(`INSERT INTO documents
        (original_name, stored_name, stored_path, mime_type, size, related_entity)
        VALUES ($original, $stored, $path, $mime, $size, 'expense_import')`, {
        original: originalName, stored: storedName, path: finalPath, mime: file.mimetype, size: file.size
      });
      const importId = insert("INSERT INTO expense_imports (document_id, status) VALUES ($document, 'pending')", { document: documentId });
      exec("UPDATE documents SET related_id=$import WHERE id=$document", { import: importId, document: documentId });
      audit("expense_import", importId, "upload", null, { document_id: documentId, original_name: originalName });
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

  app.get("/api/expense-imports/quality", (req, res) => {
    const imports = query("SELECT id, status, confidence, detected_fields_json FROM expense_imports WHERE status!='discarded'");
    const importById = new Map(imports.map((item) => [Number(item.id), { ...item, fields: json(item.detected_fields_json, {}) }]));
    const metrics = new Map();
    const ensure = (supplierId, supplierName) => {
      const key = String(supplierId || supplierName || "unknown");
      if (!metrics.has(key)) metrics.set(key, { supplier_id: supplierId || null, supplier_name: supplierName || "Sin proveedor", processed: 0, reviewed: 0, corrected_reviews: 0, corrections: {}, last_correction_at: null });
      return metrics.get(key);
    };
    imports.forEach((item) => {
      const fields = json(item.detected_fields_json, {});
      if (!fields.suggested_supplier_id && !fields.suggested_supplier_name) return;
      const metric = ensure(fields.suggested_supplier_id, fields.suggested_supplier_name);
      metric.processed += 1;
    });
    query("SELECT entity_id, before_json, after_json, created_at FROM audit_log WHERE entity_type='expense_import' AND action='review_update' ORDER BY id").forEach((auditRow) => {
      const item = importById.get(Number(auditRow.entity_id));
      const after = json(auditRow.after_json, {});
      const before = json(auditRow.before_json, {});
      const fields = after.detected_fields || item?.fields || {};
      if (!fields.suggested_supplier_id && !fields.suggested_supplier_name) return;
      const metric = ensure(fields.suggested_supplier_id, fields.suggested_supplier_name);
      metric.reviewed += 1;
      let changed = false;
      ["suggested_supplier_id", "invoice_number", "invoice_date", "subtotal", "tax", "total", "category"].forEach((field) => {
        if (JSON.stringify(before.detected_fields_json ? json(before.detected_fields_json, {})[field] : before[field]) !== JSON.stringify(fields[field])) { metric.corrections[field] = Number(metric.corrections[field] || 0) + 1; changed = true; }
      });
      if (changed) metric.corrected_reviews += 1;
      metric.last_correction_at = auditRow.created_at;
    });
    const providers = [...metrics.values()].map((metric) => {
      const totalCorrections = Object.values(metric.corrections).reduce((sum, value) => sum + Number(value || 0), 0);
      const correctionRate = metric.reviewed ? Number((metric.corrected_reviews / metric.reviewed).toFixed(2)) : 0;
      const correctionDensity = metric.reviewed ? Number((totalCorrections / metric.reviewed).toFixed(2)) : 0;
      const repeatedFields = Object.entries(metric.corrections).filter(([, count]) => count >= 2).map(([field, count]) => ({ field, corrections: count }));
      return { ...metric, correction_rate: correctionRate, correction_density: correctionDensity, repeated_fields: repeatedFields, needs_review: metric.reviewed >= 3 && (correctionRate >= 0.35 || repeatedFields.length > 0), learning_status: repeatedFields.length ? "candidate" : metric.reviewed >= 3 ? "stable" : "insufficient_sample" };
    }).sort((a, b) => Number(b.needs_review) - Number(a.needs_review) || b.correction_rate - a.correction_rate || b.processed - a.processed);
    res.json({ providers, summary: { providers: providers.length, needs_review: providers.filter((item) => item.needs_review).length, reviewed: providers.reduce((sum, item) => sum + item.reviewed, 0), corrections: providers.reduce((sum, item) => sum + Object.values(item.corrections).reduce((inner, value) => inner + Number(value || 0), 0), 0) } });
  });
  app.get("/api/expense-imports/:id", (req, res) => {
    const item = one(`SELECT ei.*, d.original_name, d.stored_name, d.mime_type, d.size
      FROM expense_imports ei JOIN documents d ON d.id=ei.document_id WHERE ei.id=$id`, { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    res.json(detailFor(item));
  });

  app.patch("/api/expense-imports/:id", (req, res) => {
    const before = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    const detected = { ...json(before.detected_fields_json, {}), ...(req.body.detected_fields || {}) };
    const status = STATUSES.has(req.body.status) ? req.body.status : before.status;
    let nextStatus = status;
    const preview = detailFor({ ...before, detected_fields_json: JSON.stringify(detected), status });
    if (!req.body.status && before.status === "review" && preview.accounting_quality.batch_eligible) nextStatus = "ready";
    exec("UPDATE expense_imports SET detected_fields_json=$fields, status=$status, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: req.params.id, fields: JSON.stringify(detected), status: nextStatus });
    audit("expense_import", Number(req.params.id), "review_update", before, { status: nextStatus, detected_fields: detected });
    saveDb();
    res.json(detailFor(one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id })));
  });

  app.post("/api/expense-imports/:id/lines/accept-all", (req, res) => {
    const item = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    if (item.status === "confirmed") return badRequest(res, "Una importación confirmada no se puede modificar.", "EXPENSE_IMPORT_CONFIRMED");
    const pending = query("SELECT id FROM expense_import_lines WHERE expense_import_id=$id AND COALESCE(human_decision,'pending')='pending'", { id: item.id });
    if (!pending.length) return res.json({ ok: true, accepted_count: 0 });
    exec("UPDATE expense_import_lines SET human_decision='accepted', updated_at=CURRENT_TIMESTAMP WHERE expense_import_id=$id AND COALESCE(human_decision,'pending')='pending'", { id: item.id });
    audit("expense_import", item.id, "accept_all_lines", item, { accepted_lines: pending.length });
    saveDb();
    res.json({ ok: true, accepted_count: pending.length });
  });
  app.patch("/api/expense-imports/:importId/lines/:lineId", (req, res) => {
    const before = one("SELECT * FROM expense_import_lines WHERE id=$id AND expense_import_id=$import", { id: req.params.lineId, import: req.params.importId });
    if (!before) return notFound(res, "Linea no encontrada", "EXPENSE_IMPORT_LINE_NOT_FOUND");
    const requested = { ...req.body };
    if (["package_count", "units_per_package", "price_per_package"].some((field) => Object.prototype.hasOwnProperty.call(requested, field))) {
      const packages = Number(requested.package_count ?? before.package_count ?? 1);
      const unitsPackage = Number(requested.units_per_package ?? before.units_per_package ?? before.quantity ?? 1);
      const pricePackage = Number(requested.price_per_package ?? before.price_per_package ?? before.line_total ?? 0);
      const totalUnits = packages * unitsPackage;
      const lineTotal = packages * pricePackage;
      requested.total_units = totalUnits;
      requested.quantity = totalUnits;
      requested.line_total = lineTotal;
      requested.unit_price = totalUnits ? lineTotal / totalUnits : 0;
    }
    const fields = ["description", "package_count", "units_per_package", "total_units", "quantity", "price_per_package", "unit_price", "line_total", "impressions", "suggested_material_id", "human_decision"];
    const params = { id: req.params.lineId };
    const updates = [];
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(requested, field)) { updates.push(`${field}=$${field}`); params[field] = requested[field] === "" ? null : requested[field]; }
    });
    if (updates.length) exec(`UPDATE expense_import_lines SET ${updates.join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, params);
    audit("expense_import_line", Number(req.params.lineId), "review_update", before, requested);
    saveDb();
    res.json(one("SELECT * FROM expense_import_lines WHERE id=$id", { id: req.params.lineId }));
  });

  app.post("/api/expense-imports/:id/lines", (req, res) => {
    const item = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    const position = Number(one("SELECT COALESCE(MAX(position),0)+1 position FROM expense_import_lines WHERE expense_import_id=$id", { id: item.id })?.position || 1);
    const packages = Number(req.body.package_count || 1);
    const unitsPackage = Number(req.body.units_per_package || req.body.quantity || 1);
    const totalUnits = Number(req.body.total_units || packages * unitsPackage);
    const total = Number(req.body.line_total || 0);
    const pricePackage = Number(req.body.price_per_package ?? (packages ? total / packages : total));
    const unitPrice = Number(req.body.unit_price ?? (totalUnits ? total / totalUnits : total));
    const id = insert(`INSERT INTO expense_import_lines
      (expense_import_id, position, original_text, description, package_count, units_per_package, total_units, quantity, price_per_package, unit_price, line_total, impressions, suggested_material_id, confidence, human_decision, original_data_json)
      VALUES ($import,$position,'',$description,$packages,$unitsPackage,$totalUnits,$totalUnits,$pricePackage,$unitPrice,$total,$impressions,$material,100,$decision,'{"manual":true}')`, {
      import: item.id, position, description: req.body.description || "Nueva linea", packages, unitsPackage, totalUnits, pricePackage, unitPrice, total,
      impressions: req.body.impressions || null, material: req.body.suggested_material_id || null, decision: req.body.human_decision || "pending"
    });
    audit("expense_import_line", id, "create_manual", null, req.body);
    saveDb();
    res.json(one("SELECT * FROM expense_import_lines WHERE id=$id", { id }));
  });

  app.delete("/api/expense-imports/:importId/lines/:lineId", (req, res) => {
    const before = one("SELECT * FROM expense_import_lines WHERE id=$id AND expense_import_id=$import", { id: req.params.lineId, import: req.params.importId });
    if (!before) return notFound(res, "Linea no encontrada", "EXPENSE_IMPORT_LINE_NOT_FOUND");
    exec("DELETE FROM expense_import_lines WHERE id=$id", { id: before.id });
    audit("expense_import_line", before.id, "delete", before, null);
    saveDb();
    res.json({ ok: true });
  });

  app.post("/api/expense-imports/:id/reprocess", (req, res) => {
    const item = one("SELECT * FROM expense_imports WHERE id=$id", { id: req.params.id });
    if (!item) return notFound(res, "Importacion no encontrada", "EXPENSE_IMPORT_NOT_FOUND");
    if (item.status === "confirmed") return badRequest(res, "Una importación confirmada no se puede reprocesar.", "EXPENSE_IMPORT_CONFIRMED");
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
    exec("BEGIN TRANSACTION");
    try {
      const invoiceId = confirmImport(item, req.body.detected_fields || {});
      exec("COMMIT");
      saveDb();
      res.json({ ok: true, invoice_id: invoiceId });
    } catch (error) {
      exec("ROLLBACK");
      badRequest(res, error, error.code || "EXPENSE_IMPORT_CONFIRM_FAILED");
    }
  });

  app.post("/api/expense-imports/batch-confirm", (req, res) => {
    const ids = [...new Set((req.body.ids || []).map(Number).filter(Boolean))];
    if (!ids.length) return badRequest(res, "Selecciona al menos una importacion.", "EXPENSE_IMPORT_BATCH_REQUIRED");
    const confirmed = [];
    const rejected = [];
    for (const id of ids) {
      const item = one("SELECT * FROM expense_imports WHERE id=$id", { id });
      if (!item) { rejected.push({ id, error: "No encontrada" }); continue; }
      const detail = detailFor(item);
      if (!["ready", "review"].includes(item.status) || !detail.accounting_quality.batch_eligible) {
        rejected.push({ id, error: "No cumple los criterios de confirmacion segura" });
        continue;
      }
      exec("BEGIN TRANSACTION");
      try {
        const invoiceId = confirmImport(item);
        exec("COMMIT");
        confirmed.push({ id, invoice_id: invoiceId });
      } catch (error) {
        exec("ROLLBACK");
        rejected.push({ id, error: error.message });
      }
    }
    saveDb();
    res.json({ confirmed, rejected });
  });

  for (const item of query(`SELECT ei.*, d.original_name, d.stored_path FROM expense_imports ei
    JOIN documents d ON d.id=ei.document_id WHERE ei.status='discarded'`)) purgeImport(item);
  for (const document of query("SELECT id, original_name FROM documents")) {
    const cleaned = cleanOriginalName(document.original_name);
    if (cleaned !== document.original_name) exec("UPDATE documents SET original_name=$name WHERE id=$id", { id: document.id, name: cleaned });
  }
  saveDb();
}

module.exports = { registerExpenseImportRoutes, cleanOriginalName, accountingQuality };
