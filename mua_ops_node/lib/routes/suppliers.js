function parseJson(value, fallback = {}) { try { return JSON.parse(value || ""); } catch { return fallback; } }

function registerSupplierRoutes(app, ctx) {
  const {
    query,
    one,
    optionalN,
    insert,
    saveDb,
    audit,
    updateEntity,
    softDelete,
    restore
  } = ctx;

  function importReliability(supplierId) {
    const sameSupplier = (fields) => String(fields?.suggested_supplier_id || '') === String(supplierId);
    const imports = query("SELECT id, detected_fields_json FROM expense_imports WHERE status!='discarded'");
    const processed = imports.filter((item) => sameSupplier(parseJson(item.detected_fields_json, {}))).length;
    const reviewedIds = new Set();
    const corrections = {};
    let correctedReviews = 0;
    query("SELECT entity_id, before_json, after_json FROM audit_log WHERE entity_type='expense_import' AND action='review_update' ORDER BY id").forEach((row) => {
      const before = parseJson(row.before_json, {});
      const after = parseJson(row.after_json, {});
      const beforeFields = before.detected_fields || parseJson(before.detected_fields_json, {});
      const afterFields = after.detected_fields || parseJson(after.detected_fields_json, {});
      if (!sameSupplier(afterFields) && !sameSupplier(beforeFields)) return;
      const id = Number(row.entity_id);
      reviewedIds.add(id);
      const keys = new Set([...Object.keys(beforeFields || {}), ...Object.keys(afterFields || {})]);
      let changed = false;
      keys.forEach((key) => {
        if (JSON.stringify(beforeFields?.[key]) !== JSON.stringify(afterFields?.[key])) {
          corrections[key] = (corrections[key] || 0) + 1;
          changed = true;
        }
      });
      if (changed) correctedReviews += 1;
    });
    const reviewed = reviewedIds.size;
    const rate = reviewed ? Number((correctedReviews / reviewed).toFixed(2)) : 0;
    const repeatedFields = Object.entries(corrections).filter(([, count]) => count >= 2).map(([field, count]) => ({ field, corrections: count }));
    return {
      processed,
      reviewed,
      corrected_reviews: correctedReviews,
      correction_rate: rate,
      reliability_score: reviewed >= 3 ? Math.max(0, Math.round((1 - rate) * 100)) : null,
      needs_review: reviewed >= 3 && (rate >= 0.35 || repeatedFields.length > 0),
      repeated_fields: repeatedFields,
      learning_status: repeatedFields.length ? "candidate" : reviewed >= 3 ? "stable" : "insufficient_sample"
    };
  }
  app.get("/api/suppliers", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    res.json(query(`SELECT * FROM suppliers WHERE ($includeDeleted=1 OR is_deleted=0) ORDER BY is_deleted, name`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    ).map((supplier) => ({ ...supplier, import_reliability: importReliability(supplier.id) })));
  });

  app.post("/api/suppliers", (req, res) => {
    const b = req.body;
    const id = insert(
      `INSERT INTO suppliers (name, category, website, lead_time_days, notes)
       VALUES ($name, $category, $website, $lead, $notes)`,
      { name: b.name, category: b.category || "", website: b.website || "", lead: optionalN(b.lead_time_days), notes: b.notes || "" }
    );
    const after = one("SELECT * FROM suppliers WHERE id=$id", { id });
    audit("supplier", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/suppliers/:id", (req, res) => {
    updateEntity("suppliers", "supplier", req.params.id, req.body, ["name", "category", "website", "lead_time_days", "notes"], res);
  });

  app.delete("/api/suppliers/:id", (req, res) => softDelete("suppliers", "supplier", req.params.id, res));
  app.post("/api/suppliers/:id/restore", (req, res) => restore("suppliers", "supplier", req.params.id, res));
}

module.exports = { registerSupplierRoutes };
