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

  function demandHistory() {
    const direct = query(`
      SELECT sol.material_id, date(so.order_date) AS demand_date,
        SUM(COALESCE(sol.quantity, 0)) AS quantity,
        COUNT(DISTINCT so.id) AS order_count
      FROM sales_order_lines sol
      JOIN sales_orders so ON so.id=sol.order_id
      JOIN materials m ON m.id=sol.material_id
      WHERE sol.material_id IS NOT NULL AND sol.is_deleted=0 AND so.is_deleted=0
        AND COALESCE(m.tracks_inventory, 1)=1
        AND date(so.order_date) >= date('now', '-83 day')
      GROUP BY sol.material_id, date(so.order_date)
    `);
    const recipes = query(`
      SELECT kri.material_id, date(so.order_date) AS demand_date,
        SUM(COALESCE(kri.quantity, 0)) AS quantity,
        COUNT(DISTINCT so.id) AS order_count
      FROM kit_recipe_items kri
      JOIN sales_orders so ON so.kit_recipe_id=kri.recipe_id
      JOIN materials m ON m.id=kri.material_id
      WHERE kri.is_deleted=0 AND COALESCE(kri.include_in_cost, 1) != 0 AND so.is_deleted=0
        AND COALESCE(m.tracks_inventory, 1)=1
        AND date(so.order_date) >= date('now', '-83 day')
      GROUP BY kri.material_id, date(so.order_date)
    `);
    const byMaterial = new Map();
    const ensure = (materialId) => {
      if (!byMaterial.has(materialId)) {
        byMaterial.set(materialId, Array.from({ length: 12 }, (_, index) => ({
          week: index + 1,
          direct: 0,
          sets: 0,
          orders: 0
        })));
      }
      return byMaterial.get(materialId);
    };
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const addRows = (rows, field) => rows.forEach((row) => {
      const date = new Date(`${row.demand_date}T12:00:00`);
      const daysAgo = Math.floor((today - date) / 86400000);
      if (!Number.isFinite(daysAgo) || daysAgo < 0 || daysAgo > 83) return;
      const weekIndex = 11 - Math.floor(daysAgo / 7);
      const bucket = ensure(Number(row.material_id))[weekIndex];
      bucket[field] += num(row.quantity);
      bucket.orders += num(row.order_count);
    });
    addRows(direct, "direct");
    addRows(recipes, "sets");
    for (const buckets of byMaterial.values()) {
      buckets.forEach((bucket, index) => {
        const start = new Date(today);
        start.setDate(today.getDate() - ((11 - index) * 7 + 6));
        bucket.label = start.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", "");
        bucket.total = bucket.direct + bucket.sets;
      });
    }
    return byMaterial;
  }

  function recommendations(filters = {}) {
    const settings = settingsObject();
    const w30 = num(settings.replenishment_weight_30, 0.7);
    const w90 = num(settings.replenishment_weight_90, 0.3);
    const defaultLead = num(settings.replenishment_default_lead_days, 14);
    const safety = num(settings.replenishment_safety_days, 7);
    const targetCoverage = num(settings.replenishment_target_coverage_days, 30);
    const costs = materialCosts();
    const historyByMaterial = demandHistory();
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
          WHERE kri.material_id=m.id AND kri.is_deleted=0 AND COALESCE(kri.include_in_cost, 1) != 0 AND so.is_deleted=0
            AND date(so.order_date) >= date('now', '-30 day')) AS set_30,
        (SELECT SUM(kri.quantity) FROM kit_recipe_items kri
          JOIN sales_orders so ON so.kit_recipe_id=kri.recipe_id
          WHERE kri.material_id=m.id AND kri.is_deleted=0 AND COALESCE(kri.include_in_cost, 1) != 0 AND so.is_deleted=0
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
      const hasConfiguredLead = configuredLeadDays > 0;
      const confidence = !stockKnown || (suggestedQuantity > 0 && !row.preferred_supplier_id) ? "incomplete"
        : !hasDemand ? "manual"
        : consumption90 >= 3 && hasConfiguredLead ? "high" : "medium";
      const confidenceScore = ({ high: 95, medium: 72, manual: 45, incomplete: 20 })[confidence];
      const physicalUrgency = !stockKnown ? "configuration"
        : hasDemand && stock <= 0 ? "critical"
        : riskBeforeArrival ? "high"
        : suggestedQuantity > 0 ? "medium" : "low";
      const action = !stockKnown || (suggestedQuantity > 0 && !row.preferred_supplier_id) ? "review"
        : !hasDemand && suggestedQuantity > 0 ? "review"
        : hasDemand && suggestedQuantity > 0 && coverageDays <= leadDays + safety ? "buy_now"
        : hasDemand && suggestedQuantity > 0 ? "buy_soon"
        : "covered";
      const priority = physicalUrgency;
      const decision = action === "buy_now" || action === "buy_soon" ? "buy"
        : action === "review" ? "configure" : "healthy";
      const reasons = [];
      if (!stockKnown) reasons.push("Stock desconocido: vincula Shopify o indica stock manual.");
      if (stockKnown && stock < 0) reasons.push(`Stock negativo (${stock} uds): se calcula la compra desde cero.`);
      if (num(row.set_30) > 0) reasons.push(`${num(row.set_30)} uds consumidas por sets en 30 dias.`);
      if (riskBeforeArrival) reasons.push(`La cobertura no alcanza el plazo de entrega de ${leadDays} dias.`);
      if (dailyDemand > 0) reasons.push(`Demanda ponderada ${dailyDemand.toFixed(2)} uds/dia; objetivo ${Math.ceil(targetStock)} uds.`);
      else if (suggestedQuantity > 0) reasons.push("Sin consumo observado; la referencia es manual y debe revisarse.");
      else reasons.push("Sin consumo observado ni deficit manual.");
      if (suggestedQuantity > 0 && row.purchase_pack_size > 1) reasons.push(`Redondeado a formato de compra de ${row.purchase_pack_size} uds.`);
      const reviewReasons = [];
      if (!stockKnown) reviewReasons.push("Falta stock fiable");
      if (suggestedQuantity > 0 && !row.preferred_supplier_id) reviewReasons.push("Falta proveedor");
      if (!hasDemand && suggestedQuantity > 0) reviewReasons.push("Objetivo manual sin consumo");
      if (hasDemand && !hasConfiguredLead) reviewReasons.push("Plazo por defecto");
      if (suggestedQuantity > 0 && unitCost <= 0) reviewReasons.push("Coste pendiente");
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
        action,
        decision,
        blockers,
        can_plan: suggestedQuantity > 0 && Boolean(row.preferred_supplier_id) && stockKnown,
        reliable_plan: suggestedQuantity > 0 && Boolean(row.preferred_supplier_id) && stockKnown && confidence === "high" && ["buy_now", "buy_soon"].includes(action),
        priority,
        confidence,
        confidence_score: confidenceScore,
        recommendation_basis: hasDemand ? "observed_demand" : "manual_target",
        has_configured_lead: hasConfiguredLead,
        review_reasons: reviewReasons,
        demand_history: historyByMaterial.get(Number(row.id)) || Array.from({ length: 12 }, (_, index) => ({
          week: index + 1,
          label: `S-${11 - index}`,
          direct: 0,
          sets: 0,
          total: 0,
          orders: 0
        })),
        projection: {
          horizon_days: 90,
          rupture_day: dailyDemand > 0 && stockKnown ? Math.max(0, planningStock / dailyDemand) : null,
          arrival_day: leadDays,
          safety_level: dailyDemand * safety,
          coverage_after_purchase_days: dailyDemand > 0 ? (planningStock + suggestedQuantity) / dailyDemand : null
        },
        formula: {
          horizon_days: leadDays + safety + targetCoverage,
          demand_until_arrival: dailyDemand * leadDays,
          safety_stock: dailyDemand * safety,
          coverage_stock: dailyDemand * targetCoverage,
          target_stock: targetStock,
          available_stock: planningStock,
          raw_deficit: rawSuggested,
          pack_size: Math.max(1, num(row.purchase_pack_size, 1)),
          minimum_order: Math.max(1, num(row.minimum_order_quantity, 1)),
          rounded_quantity: suggestedQuantity
        },
        reason: reasons.join(" ")
      };
    }).filter((row) => (!filters.priority || row.priority === filters.priority)
      && (!filters.decision || row.decision === filters.decision)
      && (!filters.action || row.action === filters.action)
      && (!filters.confidence || row.confidence === filters.confidence));
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
