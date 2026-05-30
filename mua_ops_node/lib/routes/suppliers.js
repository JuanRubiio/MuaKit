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

  app.get("/api/suppliers", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    res.json(query(
      `SELECT * FROM suppliers WHERE ($includeDeleted=1 OR is_deleted=0) ORDER BY is_deleted, name`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    ));
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
