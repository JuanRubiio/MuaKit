const { ORDER_TYPES, isValidOrderType, orderTypeMeta } = require("../services/order-typologies");

function normalizeOrderMaterial(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function orderLineIsSilver(line = {}) {
  const category = normalizeOrderMaterial(line.material_category || "");
  const baseMaterial = normalizeOrderMaterial(line.material_base_material || "");
  const source = normalizeOrderMaterial(`${line.material_name || ""} ${line.title || ""}`);
  const jewelryLike = ["joya", "cadena", "topping"].includes(category);
  if (baseMaterial === "plata") return true;
  if (!jewelryLike) return false;
  if (/\b925\b|\bsterling\b|\bsilver\b/.test(source)) return true;
  if (/\bplata\b/.test(source) && !/\bplatead[oa]s?\b/.test(source)) return true;
  return false;
}

function registerKitRoutes(app, ctx) {
  const {
    query,
    exec,
    one,
    n,
    optionalN,
    insert,
    saveDb,
    audit,
    badRequest,
    updateEntity,
    softDelete,
    restore,
    kitRecipes,
    materialCosts
  } = ctx;

  function orderLineHasKnownCost(costMap, materialId) {
    if (!materialId) return true;
    const cost = costMap.get(Number(materialId));
    return Boolean(cost && cost.weighted_avg_unit_cost_inc_vat != null);
  }

  function normalizeOrderLineInclusion(line, costMap) {
    const hasKnownCost = orderLineHasKnownCost(costMap, line.material_id);
    return hasKnownCost ? Number(line.include_in_cost ?? 1) !== 0 : false;
  }

  function normalizeHistoricalOrderLines(costMap) {
    const linesToExclude = query(
      `SELECT id, material_id
       FROM sales_order_lines
       WHERE is_deleted=0
         AND material_id IS NOT NULL
         AND COALESCE(include_in_cost, 1) != 0`
    ).filter((line) => !orderLineHasKnownCost(costMap, line.material_id));
    for (const line of linesToExclude) {
      exec(
        "UPDATE sales_order_lines SET include_in_cost=0, updated_at=CURRENT_TIMESTAMP WHERE id=$id",
        { id: line.id }
      );
    }
  }

  function profitabilityStatus({ hasLines, missingMaterials, missingLineCosts, orderSet, marginPercent }) {
    if (!hasLines) return "missing_lines";
    if (missingMaterials) return "missing_materials";
    if (missingLineCosts || orderSet?.missing_cost_items) return "missing_costs";
    if (marginPercent != null && marginPercent < 55) return "low_margin";
    return "complete";
  }

  app.get("/api/kit-recipes", (req, res) => res.json(kitRecipes()));

  app.get("/api/orders/profitability", (req, res) => {
    const fixedSets = kitRecipes();
    const activeSet = fixedSets.find((set) => Number(set.is_default || 0)) || fixedSets[0] || null;
    const costMap = new Map((materialCosts ? materialCosts() : []).map((row) => [Number(row.material_id), row]));
    const fixedSetById = new Map(fixedSets.map((set) => [Number(set.id), set]));
    const typeDefaults = new Map(
      fixedSets
        .filter((set) => set.order_type && Number(set.is_type_default || 0))
        .map((set) => [set.order_type, set])
    );
    normalizeHistoricalOrderLines(costMap);
    const orders = query(
      `SELECT o.*, kr.name AS selected_fixed_set_name, kr.version AS selected_fixed_set_version, COUNT(l.id) AS line_count
       FROM sales_orders o
       LEFT JOIN sales_order_lines l ON l.order_id=o.id AND l.is_deleted=0
       LEFT JOIN kit_recipes kr ON kr.id=o.kit_recipe_id
       WHERE o.is_deleted=0
       GROUP BY o.id
       ORDER BY o.order_date DESC, o.id DESC`
    ).map((order) => {
      const recommendedSet = typeDefaults.get(order.order_type) || null;
      const orderSet = fixedSetById.get(Number(order.kit_recipe_id)) || recommendedSet || activeSet;
      const fixedSetCost = n(orderSet?.known_cost);
      const allLines = query(
        `SELECT l.*, m.name AS material_name, m.category AS material_category,
                m.base_material AS material_base_material,
                m.finish AS material_finish,
                COALESCE(NULLIF(m.image_url_override, ''), (
                  SELECT sp.image_url
                  FROM shopify_products sp
                  WHERE sp.material_id = m.id AND sp.image_url != ''
                  ORDER BY sp.shopify_available_qty DESC, sp.id
                  LIMIT 1
                )) AS material_image_url
         FROM sales_order_lines l
         LEFT JOIN materials m ON m.id=l.material_id
         WHERE l.order_id=$id AND l.is_deleted=0
         ORDER BY l.id`,
        { id: order.id }
      ).map((line) => {
        const cost = costMap.get(Number(line.material_id));
        const unitCost = cost?.weighted_avg_unit_cost_inc_vat ?? null;
        const included = normalizeOrderLineInclusion(line, costMap);
        const totalCost = !included ? 0 : (unitCost == null ? null : unitCost * n(line.quantity, 1));
        return {
          ...line,
          include_in_cost: included ? 1 : 0,
          unit_cost: unitCost,
          total_cost: totalCost,
          is_silver: orderLineIsSilver(line)
        };
      });
      const markerLines = allLines.filter((line) => Number(line.is_type_marker || 0));
      const lines = allLines.filter((line) => !Number(line.is_type_marker || 0));
      const includedLines = lines.filter((line) => Number(line.include_in_cost ?? 1) !== 0);
      const silverLines = lines.filter((line) => line.is_silver);
      const silverIncludedLines = includedLines.filter((line) => line.is_silver);
      const contentCostKnown = includedLines.reduce((sum, line) => sum + (line.total_cost ?? 0), 0);
      const missingLineCosts = includedLines.filter((line) => line.material_id && line.unit_cost == null).length;
      const missingMaterials = includedLines.filter((line) => !line.material_id).length;
      const hasLines = lines.length > 0;
      const contentCost = hasLines ? contentCostKnown : null;
      const realCost = (contentCost ?? 0) + fixedSetCost;
      const profit = n(order.net_amount) - realCost;
      const marginPercent = n(order.net_amount) ? (profit / n(order.net_amount)) * 100 : null;
      const status = profitabilityStatus({ hasLines, missingMaterials, missingLineCosts, orderSet, marginPercent });
      return {
        ...order,
        lines,
        fixed_set: orderSet,
        recommended_fixed_set: recommendedSet,
        set_matches_recommended: Boolean(recommendedSet && orderSet && Number(recommendedSet.id) === Number(orderSet.id)),
        has_manual_set_override: Boolean(order.kit_recipe_id && recommendedSet && Number(order.kit_recipe_id) !== Number(recommendedSet.id)),
        order_type_meta: orderTypeMeta(order.order_type),
        type_marker_lines: markerLines.map((line) => ({ id: line.id, title: line.title })),
        fixed_set_options: fixedSets.map((set) => ({
          id: set.id,
          name: set.name,
          version: set.version,
          known_cost: set.known_cost,
          missing_cost_items: set.missing_cost_items,
          is_default: set.is_default,
          order_type: set.order_type,
          is_type_default: set.is_type_default
        })),
        fixed_set_cost: fixedSetCost,
        content_cost: contentCost,
        content_cost_known: contentCostKnown,
        real_cost: realCost,
        profit,
        profit_per_sale_euro: n(order.net_amount) ? profit / n(order.net_amount) : null,
        margin_percent: marginPercent,
        missing_materials: missingMaterials,
        missing_line_costs: missingLineCosts,
        excluded_lines: lines.length - includedLines.length,
        contains_silver: silverLines.length > 0,
        silver_profile: silverLines.length ? (silverLines.length === lines.length ? "silver" : "mixed") : "standard",
        silver_line_count: silverLines.length,
        silver_included_line_count: silverIncludedLines.length,
        status
      };
    });
    const completeOrders = orders.filter((order) => order.status === "complete");
    const silverOrders = orders.filter((order) => order.contains_silver);
    const standardOrders = orders.filter((order) => !order.contains_silver);
    const avg = (values) => values.length ? values.reduce((sum, value) => sum + n(value), 0) / values.length : null;
    res.json({
      active_set: activeSet,
      fixed_sets: fixedSets,
      metrics: {
        total_orders: orders.length,
        orders_with_lines: orders.filter((order) => (order.lines || []).length).length,
        incomplete_orders: orders.filter((order) => order.status !== "complete").length,
        average_ticket: avg(orders.map((order) => order.net_amount)) ?? 0,
        average_fixed_cost: avg(orders.map((order) => order.fixed_set_cost)) ?? 0,
        average_real_cost: avg(completeOrders.map((order) => order.real_cost)),
        average_margin_percent: completeOrders.length ? avg(completeOrders.map((order) => order.margin_percent)) : null,
        average_profit: completeOrders.length ? avg(completeOrders.map((order) => order.profit)) : null,
        complete_orders: completeOrders.length,
        classified_orders: orders.filter((order) => order.order_type).length,
        unclassified_orders: orders.filter((order) => !order.order_type).length,
        set_mismatch_orders: orders.filter((order) => order.recommended_fixed_set && !order.set_matches_recommended).length,
        silver_orders: silverOrders.length,
        standard_orders: standardOrders.length,
        silver_average_margin_percent: avg(silverOrders.filter((order) => order.margin_percent != null).map((order) => order.margin_percent)),
        standard_average_margin_percent: avg(standardOrders.filter((order) => order.margin_percent != null).map((order) => order.margin_percent)),
        silver_average_ticket: avg(silverOrders.map((order) => order.net_amount)),
        standard_average_ticket: avg(standardOrders.map((order) => order.net_amount)),
        silver_average_profit: avg(silverOrders.filter((order) => order.profit != null).map((order) => order.profit)),
        standard_average_profit: avg(standardOrders.filter((order) => order.profit != null).map((order) => order.profit))
      },
      order_types: ORDER_TYPES,
      orders
    });
  });

  app.patch("/api/orders/:id/type", (req, res) => {
    const before = one("SELECT * FROM sales_orders WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!before) return res.status(404).json({ error: "Pedido no encontrado" });
    const orderType = String(req.body?.order_type || "");
    if (orderType && !isValidOrderType(orderType)) return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    const recommended = orderType
      ? one(`SELECT * FROM kit_recipes
             WHERE is_deleted=0 AND order_type=$orderType AND is_type_default=1
             ORDER BY id DESC LIMIT 1`, { orderType })
      : null;
    const applyRecommended = Boolean(req.body?.apply_recommended_set);
    exec(`UPDATE sales_orders
          SET order_type=$orderType, order_type_source='manual', order_type_confidence=1,
              kit_recipe_id=CASE WHEN $applyRecommended=1 THEN $recipeId ELSE kit_recipe_id END,
              updated_at=CURRENT_TIMESTAMP
          WHERE id=$id`, {
      id: req.params.id,
      orderType: orderType || null,
      applyRecommended: applyRecommended ? 1 : 0,
      recipeId: recommended?.id || null
    });
    const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: req.params.id });
    audit("sales_order", req.params.id, applyRecommended ? "order_type_and_set_update" : "order_type_update", before, after);
    saveDb();
    res.json({ ...after, recommended_kit_recipe_id: recommended?.id || null });
  });

  app.patch("/api/orders/:id/fixed-set", (req, res) => {
    const order = one("SELECT * FROM sales_orders WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
    const recipeId = optionalN(req.body?.kit_recipe_id);
    if (recipeId) {
      const recipe = one("SELECT * FROM kit_recipes WHERE id=$id AND is_deleted=0", { id: recipeId });
      if (!recipe) return badRequest(res, "Set fijo no encontrado", "KIT_RECIPE_NOT_FOUND");
    }
    exec("UPDATE sales_orders SET kit_recipe_id=$recipeId, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: req.params.id, recipeId });
    const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: req.params.id });
    audit("sales_order", req.params.id, "fixed_set_update", order, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/order-lines/:id/include", (req, res) => {
    const before = one("SELECT * FROM sales_order_lines WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!before) return res.status(404).json({ error: "Linea de pedido no encontrada" });
    const include = req.body?.include_in_cost === undefined ? !Number(before.include_in_cost ?? 1) : Boolean(req.body.include_in_cost);
    if (include) {
      const costMap = new Map((materialCosts ? materialCosts() : []).map((row) => [Number(row.material_id), row]));
      if (!normalizeOrderLineInclusion({ ...before, include_in_cost: 1 }, costMap)) {
        return badRequest(res, "No se puede incluir una línea sin coste registrado", "ORDER_LINE_COST_REQUIRED");
      }
    }
    exec("UPDATE sales_order_lines SET include_in_cost=$include, updated_at=CURRENT_TIMESTAMP WHERE id=$id", {
      id: req.params.id,
      include: include ? 1 : 0
    });
    const after = one("SELECT * FROM sales_order_lines WHERE id=$id", { id: req.params.id });
    audit("sales_order_line", req.params.id, include ? "include_in_cost" : "exclude_from_cost", before, after);
    saveDb();
    res.json(after);
  });

  app.post("/api/kit-recipes", (req, res) => {
    if (req.body.is_default) exec("UPDATE kit_recipes SET is_default=0");
    const orderType = String(req.body.order_type || "");
    if (!isValidOrderType(orderType)) return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    if (req.body.is_type_default && orderType) {
      exec("UPDATE kit_recipes SET is_type_default=0 WHERE order_type=$orderType", { orderType });
    }
    const id = insert(
      `INSERT INTO kit_recipes (name, version, is_complete, is_default, order_type, is_type_default, notes)
       VALUES ($name, $version, $isComplete, $isDefault, $orderType, $isTypeDefault, $notes)`,
      {
        name: req.body.name,
        version: req.body.version || "",
        isComplete: req.body.is_complete ? 1 : 0,
        isDefault: req.body.is_default ? 1 : 0,
        orderType,
        isTypeDefault: req.body.is_type_default ? 1 : 0,
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipes WHERE id=$id", { id });
    audit("kit_recipe", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:id", (req, res) => {
    const payload = {
      ...req.body,
      is_complete: req.body.is_complete === undefined ? undefined : (req.body.is_complete ? 1 : 0),
      is_default: req.body.is_default === undefined ? undefined : (req.body.is_default ? 1 : 0)
      ,is_type_default: req.body.is_type_default === undefined ? undefined : (req.body.is_type_default ? 1 : 0)
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    if (payload.is_default) exec("UPDATE kit_recipes SET is_default=0 WHERE id!=$id", { id: req.params.id });
    if (payload.order_type !== undefined && !isValidOrderType(String(payload.order_type || ""))) {
      return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    }
    const current = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    const targetType = payload.order_type === undefined ? String(current?.order_type || "") : String(payload.order_type || "");
    if (payload.is_type_default && targetType) {
      exec("UPDATE kit_recipes SET is_type_default=0 WHERE order_type=$orderType AND id!=$id", { orderType: targetType, id: req.params.id });
    }
    updateEntity("kit_recipes", "kit_recipe", req.params.id, payload, ["name", "version", "is_complete", "is_default", "order_type", "is_type_default", "notes"], res);
  });

  app.delete("/api/kit-recipes/:id", (req, res) => softDelete("kit_recipes", "kit_recipe", req.params.id, res));
  app.post("/api/kit-recipes/:id/restore", (req, res) => restore("kit_recipes", "kit_recipe", req.params.id, res));

  app.post("/api/kit-recipes/:id/items", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const itemId = insert(
      `INSERT INTO kit_recipe_items (recipe_id, material_id, quantity, include_in_cost, notes)
       VALUES ($recipe, $material, $quantity, $include, $notes)`,
      {
        recipe: req.params.id,
        material: optionalN(req.body.material_id),
        quantity: n(req.body.quantity, 1),
        include: req.body.include_in_cost === undefined ? 1 : (req.body.include_in_cost ? 1 : 0),
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipe_items WHERE id=$id", { id: itemId });
    audit("kit_recipe_item", itemId, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const payload = {
      ...req.body,
      include_in_cost: req.body.include_in_cost === undefined ? undefined : (req.body.include_in_cost ? 1 : 0)
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    updateEntity("kit_recipe_items", "kit_recipe_item", req.params.itemId, payload, ["material_id", "quantity", "include_in_cost", "notes"], res);
  });

  app.patch("/api/kit-recipes/:recipeId/items/:itemId/include", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (!recipe || recipe.is_deleted) return res.status(404).json({ error: "Set fijo no encontrado" });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const before = one("SELECT * FROM kit_recipe_items WHERE id=$id AND recipe_id=$recipeId AND is_deleted=0", {
      id: req.params.itemId,
      recipeId: req.params.recipeId
    });
    if (!before) return res.status(404).json({ error: "Componente no encontrado" });
    const include = req.body?.include_in_cost === undefined ? !Number(before.include_in_cost ?? 1) : Boolean(req.body.include_in_cost);
    exec("UPDATE kit_recipe_items SET include_in_cost=$include, updated_at=CURRENT_TIMESTAMP WHERE id=$id", {
      id: req.params.itemId,
      include: include ? 1 : 0
    });
    const after = one("SELECT * FROM kit_recipe_items WHERE id=$id", { id: req.params.itemId });
    audit("kit_recipe_item", req.params.itemId, include ? "include_in_cost" : "exclude_from_cost", before, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    softDelete("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });

  app.post("/api/kit-recipes/:recipeId/items/:itemId/restore", (req, res) => {
    restore("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });
}

module.exports = { registerKitRoutes };
