function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ceilToPack(quantity, packSize, minimum) {
  const pack = Math.max(1, num(packSize, 1));
  const min = Math.max(1, num(minimum, 1));
  if (quantity <= 0) return 0;
  return Math.max(min, Math.ceil(quantity / pack) * pack);
}

function createReplenishmentService({ query, materialCosts, settingsObject }) {
  let lastRun = null;

  function recommendations(filters = {}) {
    const settings = settingsObject();
    const w30 = num(settings.replenishment_weight_30, 0.7);
    const w90 = num(settings.replenishment_weight_90, 0.3);
    const defaultLead = num(settings.replenishment_default_lead_days, 14);
    const safety = num(settings.replenishment_safety_days, 7);
    const targetCoverage = num(settings.replenishment_target_coverage_days, 30);
    const costs = materialCosts();
    const costByMaterial = new Map(costs.map((row) => [Number(row.material_id), num(row.weighted_unit_cost)]));
    const rows = query(`
      SELECT m.*, s.name AS supplier_name, s.lead_time_days,
        (SELECT COUNT(*) FROM shopify_products sp WHERE sp.material_id=m.id) AS linked_product_count,
        (SELECT SUM(sp.shopify_available_qty) FROM shopify_products sp WHERE sp.material_id=m.id) AS shopify_stock,
        (SELECT SUM(sol.quantity) FROM sales_order_lines sol
          JOIN sales_orders so ON so.id=sol.order_id
          WHERE sol.material_id=m.id AND sol.is_deleted=0 AND so.is_deleted=0
            AND date(so.order_date) >= date('now', '-30 day')) AS direct_30,
        (SELECT SUM(sol.quantity) FROM sales_order_lines sol
          JOIN sales_orders so ON so.id=sol.order_id
          WHERE sol.material_id=m.id AND sol.is_deleted=0 AND so.is_deleted=0
            AND date(so.order_date) >= date('now', '-90 day')) AS direct_90,
        (SELECT SUM(kri.quantity) FROM kit_recipe_items kri
          JOIN sales_orders so ON so.kit_recipe_id=kri.recipe_id
          WHERE kri.material_id=m.id AND kri.is_deleted=0 AND so.is_deleted=0
            AND date(so.order_date) >= date('now', '-30 day')) AS set_30,
        (SELECT SUM(kri.quantity) FROM kit_recipe_items kri
          JOIN sales_orders so ON so.kit_recipe_id=kri.recipe_id
          WHERE kri.material_id=m.id AND kri.is_deleted=0 AND so.is_deleted=0
            AND date(so.order_date) >= date('now', '-90 day')) AS set_90
      FROM materials m
      LEFT JOIN suppliers s ON s.id=m.preferred_supplier_id
      WHERE m.is_deleted=0 AND COALESCE(m.tracks_inventory, 1)=1
      ORDER BY m.is_priority_restock DESC, m.name
    `);
    const result = rows.map((row) => {
      const consumption30 = num(row.direct_30) + num(row.set_30);
      const consumption90 = num(row.direct_90) + num(row.set_90);
      const dailyDemand = w30 * (consumption30 / 30) + w90 * (consumption90 / 90);
      const leadDays = num(row.lead_time_days, defaultLead);
      const hasShopify = num(row.linked_product_count) > 0;
      const stockKnown = hasShopify || row.manual_stock !== null;
      const stock = hasShopify ? num(row.shopify_stock) : num(row.manual_stock);
      const dynamicPoint = dailyDemand > 0 ? dailyDemand * (leadDays + safety) : num(row.reorder_point);
      const targetStock = dailyDemand > 0 ? dailyDemand * (leadDays + safety + targetCoverage) : num(row.target_stock);
      const rawSuggested = stockKnown ? Math.max(0, targetStock - stock) : 0;
      const suggestedQuantity = ceilToPack(rawSuggested, row.purchase_pack_size, row.minimum_order_quantity);
      const coverageDays = dailyDemand > 0 && stockKnown ? stock / dailyDemand : null;
      const priority = !stockKnown ? "configuration" :
        stock <= 0 ? "critical" :
        coverageDays !== null && coverageDays <= leadDays ? "high" :
        row.is_priority_restock || stock <= dynamicPoint ? "medium" : "low";
      const reasons = [];
      if (!stockKnown) reasons.push("Stock desconocido: vincula Shopify o indica stock manual.");
      if (num(row.set_30) > 0) reasons.push(`${num(row.set_30)} uds consumidas por sets en 30 dias.`);
      if (dailyDemand > 0) reasons.push(`Demanda ponderada ${dailyDemand.toFixed(2)} uds/dia; cobertura objetivo ${leadDays + safety + targetCoverage} dias.`);
      else reasons.push("Sin consumo suficiente; se aplican minimo y objetivo manuales.");
      return {
        ...row,
        stock_known: stockKnown,
        effective_stock: stockKnown ? stock : null,
        consumption_30: consumption30,
        consumption_90: consumption90,
        daily_demand: dailyDemand,
        coverage_days: coverageDays,
        lead_days: leadDays,
        dynamic_reorder_point: dynamicPoint,
        calculated_target_stock: targetStock,
        suggested_quantity: suggestedQuantity,
        estimated_cost: suggestedQuantity * num(costByMaterial.get(Number(row.id))),
        unit_cost: num(costByMaterial.get(Number(row.id))),
        priority,
        reason: reasons.join(" ")
      };
    }).filter((row) => !filters.priority || row.priority === filters.priority);
    lastRun = new Date().toISOString();
    return {
      generated_at: lastRun,
      parameters: { weight_30: w30, weight_90: w90, default_lead_days: defaultLead, safety_days: safety, target_coverage_days: targetCoverage },
      recommendations: result
    };
  }

  return { recommendations, getLastRun: () => lastRun };
}

module.exports = { createReplenishmentService, ceilToPack };
