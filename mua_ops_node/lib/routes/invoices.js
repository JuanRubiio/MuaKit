function registerInvoiceRoutes(app, ctx) {
  const {
    query,
    one,
    n,
    optionalN,
    insert,
    saveDb,
    audit,
    badRequest,
    notFound,
    invoiceParams,
    normalizeLine,
    createInvoiceLine,
    updateEntity,
    softDelete,
    restore,
    upload,
    fs,
    path,
    UPLOAD_DIR
  } = ctx;

  app.get("/api/invoices", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    res.json(query(
      `SELECT i.*, s.name AS supplier_name, d.original_name AS document_name, d.stored_name AS document_stored_name,
              COUNT(l.id) AS line_count
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN documents d ON d.id = i.document_id
       LEFT JOIN invoice_lines l ON l.invoice_id = i.id AND l.is_deleted = 0
       WHERE ($includeDeleted=1 OR i.is_deleted=0)
       GROUP BY i.id
       ORDER BY i.is_deleted, i.invoice_date DESC, i.id DESC`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    ));
  });

  app.post("/api/invoices", (req, res) => {
    const b = req.body;
    const id = insert(
      `INSERT INTO invoices (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, status, notes)
       VALUES ($supplier, $document, $number, $date, $category, $subtotal, $discount, $shipping, $tax, $total, $currency, $status, $notes)`,
      invoiceParams(b)
    );
    const after = one("SELECT * FROM invoices WHERE id=$id", { id });
    audit("invoice", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.get("/api/invoices/:id", (req, res) => {
    const invoice = one(
      `SELECT i.*, s.name AS supplier_name, d.original_name AS document_name, d.stored_name AS document_stored_name,
              d.stored_path AS document_path, d.mime_type,
              (SELECT ei.pages_json FROM expense_imports ei WHERE ei.invoice_id=i.id OR ei.document_id=i.document_id ORDER BY ei.id DESC LIMIT 1) AS document_pages_json,
              (SELECT ei.detected_fields_json FROM expense_imports ei WHERE ei.invoice_id=i.id OR ei.document_id=i.document_id ORDER BY ei.id DESC LIMIT 1) AS document_detected_fields_json
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN documents d ON d.id = i.document_id
       WHERE i.id=$id`,
      { id: req.params.id }
    );
    if (!invoice) return notFound(res, "Factura no encontrada", "INVOICE_NOT_FOUND");
    try { invoice.document_pages = JSON.parse(invoice.document_pages_json || "[]"); } catch { invoice.document_pages = []; }
    try { invoice.document_detected_fields = JSON.parse(invoice.document_detected_fields_json || "{}"); } catch { invoice.document_detected_fields = {}; }
    delete invoice.document_pages_json;
    delete invoice.document_detected_fields_json;
    const lines = query(
      `SELECT l.*, m.name AS material_name, m.category AS material_category,
              m.usage_type AS material_usage_type, m.family AS material_family, m.subfamily AS material_subfamily,
              m.variant AS material_variant, m.base_material AS material_base_material, m.finish AS material_finish,
              COALESCE(NULLIF(m.image_url_override, ''), (
                SELECT sp.image_url
                FROM shopify_products sp
                WHERE sp.material_id = m.id AND sp.image_url != ''
                ORDER BY sp.shopify_available_qty DESC, sp.id
                LIMIT 1
              )) AS material_image_url
       FROM invoice_lines l
       LEFT JOIN materials m ON m.id = l.material_id
       WHERE l.invoice_id=$id
       ORDER BY l.is_deleted, l.id`,
      { id: req.params.id }
    );
    res.json({ invoice, lines });
  });

  app.patch("/api/invoices/:id", (req, res) => {
    updateEntity("invoices", "invoice", req.params.id, req.body, [
      "supplier_id", "document_id", "invoice_number", "invoice_date", "category", "subtotal", "discount", "shipping", "tax", "total", "currency", "status", "notes"
    ], res);
  });

  app.post("/api/invoices/:id/duplicate", (req, res) => {
    const source = one("SELECT * FROM invoices WHERE id=$id", { id: req.params.id });
    if (!source) return notFound(res, "Factura no encontrada", "INVOICE_NOT_FOUND");
    const id = insert(
      `INSERT INTO invoices (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, status, notes)
       VALUES ($supplier_id, $document_id, $invoice_number, $invoice_date, $category, $subtotal, $discount, $shipping, $tax, $total, $currency, 'draft', $notes)`,
      { ...source, invoice_number: `${source.invoice_number || "sin-numero"} copia` }
    );
    for (const line of query("SELECT * FROM invoice_lines WHERE invoice_id=$id AND is_deleted=0", { id: req.params.id })) {
      insert(
        `INSERT INTO invoice_lines (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, allocate_shipping, tax, affects_stock, impressions, notes)
         VALUES ($invoice, $material, $description, $packages, $unitsPackage, $totalUnits, $pricePackage, $unitPrice, $lineTotal, $shipping, $tax, $stock, $impressions, $notes)`,
        {
          invoice: id,
          material: line.material_id,
          description: line.description,
          packages: line.package_count,
          unitsPackage: line.units_per_package,
          totalUnits: line.total_units,
          pricePackage: line.price_per_package,
          unitPrice: line.unit_price,
          lineTotal: line.line_total,
          shipping: line.allocate_shipping,
          tax: line.tax,
          stock: line.affects_stock,
          impressions: line.impressions,
          notes: line.notes
        }
      );
    }
    const after = one("SELECT * FROM invoices WHERE id=$id", { id });
    audit("invoice", id, "duplicate", source, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/invoices/:id", (req, res) => softDelete("invoices", "invoice", req.params.id, res));
  app.post("/api/invoices/:id/restore", (req, res) => restore("invoices", "invoice", req.params.id, res));

  app.post("/api/invoices/:id/lines", (req, res) => {
    const id = createInvoiceLine(req.params.id, req.body);
    const after = one("SELECT * FROM invoice_lines WHERE id=$id", { id });
    audit("invoice_line", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/invoices/:invoiceId/lines/:lineId", (req, res) => {
    const b = normalizeLine(req.body);
    updateEntity("invoice_lines", "invoice_line", req.params.lineId, b, [
      "material_id", "description", "package_count", "units_per_package", "total_units", "price_per_package", "unit_price", "line_total", "allocate_shipping", "tax", "affects_stock", "impressions", "notes"
    ], res);
  });

  app.post("/api/invoices/:invoiceId/lines/:lineId/duplicate", (req, res) => {
    const line = one("SELECT * FROM invoice_lines WHERE id=$id AND invoice_id=$invoice", { id: req.params.lineId, invoice: req.params.invoiceId });
    if (!line) return notFound(res, "Linea no encontrada", "INVOICE_LINE_NOT_FOUND");
    const id = insert(
      `INSERT INTO invoice_lines (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, allocate_shipping, tax, affects_stock, impressions, notes)
       VALUES ($invoice, $material, $description, $packages, $unitsPackage, $totalUnits, $pricePackage, $unitPrice, $lineTotal, $shipping, $tax, $stock, $impressions, $notes)`,
      {
        invoice: req.params.invoiceId,
        material: line.material_id,
        description: line.description,
        packages: line.package_count,
        unitsPackage: line.units_per_package,
        totalUnits: line.total_units,
        pricePackage: line.price_per_package,
        unitPrice: n(line.total_units) > 0 ? n(line.line_total) / n(line.total_units) : null,
        lineTotal: line.line_total,
        shipping: 0,
        tax: 0,
        stock: line.affects_stock,
        impressions: line.impressions,
        notes: line.notes
      }
    );
    const after = one("SELECT * FROM invoice_lines WHERE id=$id", { id });
    audit("invoice_line", id, "duplicate", line, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/invoices/:invoiceId/lines/:lineId", (req, res) => softDelete("invoice_lines", "invoice_line", req.params.lineId, res));
  app.post("/api/invoices/:invoiceId/lines/:lineId/restore", (req, res) => restore("invoice_lines", "invoice_line", req.params.lineId, res));

  app.post("/api/documents", upload.single("document"), (req, res) => {
    if (!req.file) return badRequest(res, "Falta archivo", "DOCUMENT_REQUIRED");
    const ext = path.extname(req.file.originalname);
    const storedName = `${Date.now()}-${req.file.filename}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, storedName);
    fs.renameSync(req.file.path, finalPath);
    const id = insert(
      `INSERT INTO documents (original_name, stored_name, stored_path, mime_type, size, related_entity, related_id)
       VALUES ($original, $stored, $path, $mime, $size, $entity, $relatedId)`,
      {
        original: req.file.originalname,
        stored: storedName,
        path: finalPath,
        mime: req.file.mimetype,
        size: req.file.size,
        entity: req.body.related_entity || "",
        relatedId: optionalN(req.body.related_id)
      }
    );
    const after = one("SELECT * FROM documents WHERE id=$id", { id });
    audit("document", id, "create", null, after);
    saveDb();
    res.json(after);
  });
}

module.exports = { registerInvoiceRoutes };
