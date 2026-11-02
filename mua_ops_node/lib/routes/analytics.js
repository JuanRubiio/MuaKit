function registerAnalyticsRoutes(app, ctx) {
  const {
    query,
    optionalN,
    materialCosts,
    materialCostDetail,
    dashboardFinance,
    notFound
  } = ctx;

  app.get("/api/costs/materials", (req, res) => res.json(materialCosts()));

  app.get("/api/costs/materials/:id", (req, res) => {
    const detail = materialCostDetail(req.params.id);
    if (!detail) return notFound(res, "Material no encontrado", "MATERIAL_NOT_FOUND");
    res.json(detail);
  });

  app.get("/api/dashboard/finance", (req, res) => res.json(dashboardFinance(req.query || {})));

  app.get("/api/audit-log", (req, res) => {
    const entity = req.query.entity || "";
    const action = req.query.action || "";
    const id = optionalN(req.query.id);
    const q = `%${String(req.query.q || "").trim().toLowerCase()}%`;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const scope = String(req.query.scope || "business").trim();
    const limit = Math.min(Math.max(optionalN(req.query.limit) || 200, 1), 500);
    res.json(query(
      `SELECT * FROM audit_log
       WHERE ($entity = '' OR entity_type = $entity)
         AND ($action = '' OR action = $action)
         AND ($id IS NULL OR entity_id = $id)
         AND ($from = '' OR date(created_at) >= date($from))
         AND ($to = '' OR date(created_at) <= date($to))
         AND ($q = '%%' OR lower(
           coalesce(entity_type, '') || ' ' ||
           coalesce(action, '') || ' ' ||
           coalesce(actor, '') || ' ' ||
           coalesce(before_json, '') || ' ' ||
           coalesce(after_json, '')
         ) LIKE $q)
         AND (
           ($scope = 'technical' AND entity_type IN ('client', 'shopify_product', 'system'))
           OR ($scope = 'business' AND entity_type NOT IN ('client', 'shopify_product', 'system'))
           OR ($scope = 'all')
         )
       ORDER BY id DESC
       LIMIT $limit`,
      { entity, action, id, q, from, to, scope, limit }
    ));
  });
}

module.exports = { registerAnalyticsRoutes };
