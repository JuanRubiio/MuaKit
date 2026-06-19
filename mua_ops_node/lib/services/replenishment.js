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
    const costByMaterial = new Map(costs.map((row) => [
      Number(row.material_id),
      num(row.weighted_avg_unit_cost_inc_vat ?? row.last_unit_cost_inc_vat)
    ]));
    const rows = query(`
      SELECT m.*, s.name AS supplier_name, s.lead_time_days,
        COALESCE(NULLIF(m.image_url_override, ''), (
          SELECT sp.image_url
          FROM shopify_products sp
          WHERE sp.material_id = m.id AND sp.image_url != ''
          ORDER BY sp.shopify_available_qty DESC, sp.id
          LIMIT 1
        ), '') AS image_url,
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
      const configuredLeadDays = num(row.lead_time_days);
      const leadDays = configuredLeadDays > 0 ? configuredLeadDays : defaultLead;
      const hasShopify = num(row.linked_product_count) > 0;
      const stockKnown = hasShopify || row.manual_stock !== null;
      const stock = hasShopify ? num(row.shopify_stock) : num(row.manual_stock);
      const planningStock = Math.max(0, stock);
      const dynamicPoint = dailyDemand > 0 ? dailyDemand * (leadDays + safety) : num(row.reorder_point);
      const targetStock = dailyDemand > 0 ? dailyDemand * (leadDays + safety + targetCoverage) : num(row.target_stock);
      const rawSuggested = stockKnown ? Math.max(0, targetStock - planningStock) : 0;
      const suggestedQuantity = ceilToPack(rawSuggested, row.purchase_pack_size, row.minimum_order_quantity);
      const coverageDays = dailyDemand > 0 && stockKnown ? planningStock / dailyDemand : null;
      const daily30 = consumption30 / 30;
      const daily90 = consumption90 / 90;
      const trendRatio = daily90 > 0 ? daily30 / daily90 : daily30 > 0 ? 2 : 1;
      const trend = trendRatio >= 1.25 ? "accelerating" : trendRatio <= 0.75 ? "slowing" : "stable";
      const hasDemand = dailyDemand > 0;
      const riskBeforeArrival = hasDemand && coverageDays !== null && coverageDays <= leadDays;
      const unitCost = num(costByMaterial.get(Number(row.id)));
      const blockers = [];
      if (!stockKnown) blockers.push("stock");
      if (suggestedQuantity > 0 && !row.preferred_supplier_id) blockers.push("supplier");
      if (suggestedQuantity > 0 && unitCost <= 0) blockers.push("cost");
      const priority = !stockKnown ? "configuration" :
        hasDemand && stock <= 0 ? "critical" :
        riskBeforeArrival ? "high" :
        suggestedQuantity > 0 || (hasDemand && coverageDays <= leadDays + safety) || row.is_priority_restock ? "medium" : "low";
      const decision = !stockKnown ? "configure" :
        suggestedQuantity > 0 ? "buy" :
        priority === "critical" || priority === "high" || priority === "medium" ? "monitor" : "healthy";
      const reasons = [];
      if (!stockKnown) reasons.push("Stock desconocido: vincula Shopify o indica stock manual.");
      if (stockKnown && stock < 0) reasons.push(`Stock negativo (${stock} uds): se calcula la compra desde cero.`);
      if (num(row.set_30) > 0) reasons.push(`${num(row.set_30)} uds consumidas por sets en 30 dias.`);
      if (riskBeforeArrival) reasons.push(`La cobertura no alcanza el plazo de entrega de ${leadDays} dias.`);
      if (dailyDemand > 0) reasons.push(`Demanda ponderada ${dailyDemand.toFixed(2)} uds/dia; objetivo ${Math.ceil(targetStock)} uds.`);
      else reasons.push("Sin consumo suficiente; se aplican minimo y objetivo manuales.");
      if (suggestedQuantity > 0 && row.purchase_pack_size > 1) reasons.push(`Redondeado a formato de compra de ${row.purchase_pack_size} uds.`);
      return {
        ...row,
        stock_known: stockKnown,
        effective_stock: stockKnown ? stock : null,
        planning_stock: stockKnown ? planningStock : null,
        consumption_30: consumption30,
        consumption_90: consumption90,
        daily_demand: dailyDemand,
        coverage_days: coverageDays,
        lead_days: leadDays,
        dynamic_reorder_point: dynamicPoint,
        calculated_target_stock: targetStock,
        suggested_quantity: suggestedQuantity,
        estimated_cost: suggestedQuantity * unitCost,
        unit_cost: unitCost,
        cost_known: unitCost > 0,
        has_demand: hasDemand,
        trend,
        trend_ratio: trendRatio,
        risk_before_arrival: riskBeforeArrival,
        arrival_gap_days: coverageDays === null ? null : coverageDays - leadDays,
        decision,
        blockers,
        can_plan: suggestedQuantity > 0 && Boolean(row.preferred_supplier_id),
        priority,
        reason: reasons.join(" ")
      };
    }).filter((row) => (!filters.priority || row.priority === filters.priority) && (!filters.decision || row.decision === filters.decision));
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
