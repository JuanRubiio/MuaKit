function registerPurchaseRoutes(app, ctx) {
  const { query, one, exec, insert, saveDb, audit, badRequest, notFound, replenishment } = ctx;

  function recalculatePlan(planId) {
    for (const order of query("SELECT id FROM purchase_orders WHERE purchase_plan_id=$id", { id: planId })) {
      const total = one(`SELECT COALESCE(SUM(CASE WHEN is_excluded=0 THEN ordered_quantity*unit_cost_snapshot ELSE 0 END),0) total
        FROM purchase_order_lines WHERE purchase_order_id=$id`, { id: order.id }).total;
      exec("UPDATE purchase_orders SET estimated_total=$total,updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: order.id, total });
    }
    const total = one("SELECT COALESCE(SUM(estimated_total),0) total FROM purchase_orders WHERE purchase_plan_id=$id", { id: planId }).total;
    const statuses = query("SELECT status FROM purchase_orders WHERE purchase_plan_id=$id", { id: planId }).map((row) => row.status);
    const status = statuses.length && statuses.every((value) => value === "received") ? "received"
      : statuses.some((value) => value === "partially_received") ? "partially_received"
      : statuses.some((value) => value === "ordered" || value === "received") ? "ordered" : "draft";
    exec("UPDATE purchase_plans SET estimated_total=$total,status=$status,updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: planId, total, status });
  }

  function planDetail(id) {
    const plan = one("SELECT * FROM purchase_plans WHERE id=$id", { id });
    if (!plan) return null;
    const orders = query(`SELECT po.*, s.name supplier_name, i.invoice_number
      FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN invoices i ON i.id=po.invoice_id
      WHERE po.purchase_plan_id=$id ORDER BY s.name,po.id`, { id });
    orders.forEach((order) => {
      order.lines = query(`SELECT pol.*, m.name material_name, m.unit_label
        FROM purchase_order_lines pol JOIN materials m ON m.id=pol.material_id
        WHERE pol.purchase_order_id=$id ORDER BY pol.is_excluded,m.name`, { id: order.id });
      order.receipts = query("SELECT * FROM purchase_receipts WHERE purchase_order_id=$id ORDER BY received_at,id", { id: order.id });
    });
    return { plan, orders };
  }

  app.get("/api/replenishment/recommendations", (req, res) => res.json(replenishment.recommendations({
    priority: req.query.priority,
    decision: req.query.decision,
    action: req.query.action,
    confidence: req.query.confidence
  })));

  app.get("/api/purchase-plans", (req, res) => res.json(query(`SELECT pp.*,
    (SELECT COUNT(*) FROM purchase_orders po WHERE po.purchase_plan_id=pp.id) order_count,
    (SELECT COUNT(*) FROM purchase_order_lines pol JOIN purchase_orders po ON po.id=pol.purchase_order_id WHERE po.purchase_plan_id=pp.id AND pol.is_excluded=0) line_count,
    (SELECT COALESCE(SUM(pol.ordered_quantity-pol.received_quantity),0) FROM purchase_order_lines pol JOIN purchase_orders po ON po.id=pol.purchase_order_id WHERE po.purchase_plan_id=pp.id AND pol.is_excluded=0) pending_units
    FROM purchase_plans pp ORDER BY pp.created_at DESC,pp.id DESC`)));

  app.post("/api/purchase-plans", (req, res) => {
    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : (req.body.material_ids || []).map((materialId) => ({ material_id: materialId }));
    const requestedByMaterial = new Map(requestedLines.map((line) => [Number(line.material_id), line]));
    const recommendations = replenishment.recommendations().recommendations.filter((row) => requestedByMaterial.has(Number(row.id)) && row.can_plan);
    if (!recommendations.length) return badRequest(res, "Selecciona recomendaciones con cantidad sugerida.", "PURCHASE_PLAN_EMPTY");
    exec("BEGIN TRANSACTION");
    try {
      const planId = insert("INSERT INTO purchase_plans (name,status,notes) VALUES ($name,'draft',$notes)", { name: req.body.name || `Plan ${new Date().toISOString().slice(0, 10)}`, notes: req.body.notes || "" });
      const bySupplier = new Map();
      recommendations.forEach((item) => {
        const key = item.preferred_supplier_id || null;
        if (!bySupplier.has(key)) bySupplier.set(key, []);
        bySupplier.get(key).push(item);
      });
      let planTotal = 0;
      for (const [supplier, items] of bySupplier.entries()) {
        const orderId = insert("INSERT INTO purchase_orders (purchase_plan_id,supplier_id,status) VALUES ($plan,$supplier,'draft')", { plan: planId, supplier });
        let orderTotal = 0;
        items.forEach((item) => {
          const requested = requestedByMaterial.get(Number(item.id));
          const orderedQuantity = Math.max(0, Number(requested?.ordered_quantity ?? item.suggested_quantity));
          orderTotal += orderedQuantity * Number(item.unit_cost || 0);
          insert(`INSERT INTO purchase_order_lines
            (purchase_order_id,material_id,suggested_quantity,ordered_quantity,unit_cost_snapshot,pack_size_snapshot,reason_snapshot)
            VALUES ($order,$material,$suggested,$ordered,$cost,$pack,$reason)`, {
            order: orderId, material: item.id, suggested: item.suggested_quantity, ordered: orderedQuantity,
            cost: item.unit_cost, pack: item.purchase_pack_size || 1, reason: item.reason
          });
        });
        planTotal += orderTotal;
        exec("UPDATE purchase_orders SET estimated_total=$total WHERE id=$id", { id: orderId, total: orderTotal });
      }
      exec("UPDATE purchase_plans SET estimated_total=$total WHERE id=$id", { id: planId, total: planTotal });
      audit("purchase_plan", planId, "create", null, { recommendations: recommendations.length, estimated_total: planTotal });
      exec("COMMIT");
      saveDb();
      res.json(planDetail(planId));
    } catch (error) { exec("ROLLBACK"); throw error; }
  });

  app.get("/api/purchase-plans/:id", (req, res) => {
    const detail = planDetail(req.params.id);
    if (!detail) return notFound(res, "Plan no encontrado", "PURCHASE_PLAN_NOT_FOUND");
    res.json(detail);
  });

  app.patch("/api/purchase-orders/:id", (req, res) => {
    const before = one("SELECT * FROM purchase_orders WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Pedido de compra no encontrado", "PURCHASE_ORDER_NOT_FOUND");
    const status = req.body.status || before.status;
    exec(`UPDATE purchase_orders SET status=$status, invoice_id=$invoice, notes=$notes,
      ordered_at=CASE WHEN $status='ordered' AND ordered_at IS NULL THEN CURRENT_TIMESTAMP ELSE ordered_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=$id`, { id: req.params.id, status, invoice: req.body.invoice_id ?? before.invoice_id, notes: req.body.notes ?? before.notes });
    audit("purchase_order", Number(req.params.id), "update", before, req.body);
    recalculatePlan(before.purchase_plan_id);
    saveDb();
    res.json(one("SELECT * FROM purchase_orders WHERE id=$id", { id: req.params.id }));
  });

  app.patch("/api/purchase-order-lines/:id", (req, res) => {
    const before = one("SELECT * FROM purchase_order_lines WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Linea de compra no encontrada", "PURCHASE_ORDER_LINE_NOT_FOUND");
    exec("UPDATE purchase_order_lines SET ordered_quantity=$quantity,is_excluded=$excluded,updated_at=CURRENT_TIMESTAMP WHERE id=$id", {
      id: req.params.id,
      quantity: Math.max(Number(before.received_quantity || 0), Number(req.body.ordered_quantity ?? before.ordered_quantity)),
      excluded: req.body.is_excluded === undefined ? before.is_excluded : req.body.is_excluded ? 1 : 0
    });
    audit("purchase_order_line", Number(req.params.id), "update", before, req.body);
    const order = one("SELECT purchase_plan_id FROM purchase_orders WHERE id=$id", { id: before.purchase_order_id });
    recalculatePlan(order.purchase_plan_id);
    saveDb();
    res.json(one("SELECT * FROM purchase_order_lines WHERE id=$id", { id: req.params.id }));
  });

  app.post("/api/purchase-orders/:id/receipts", (req, res) => {
    const order = one("SELECT * FROM purchase_orders WHERE id=$id", { id: req.params.id });
    if (!order) return notFound(res, "Pedido de compra no encontrado", "PURCHASE_ORDER_NOT_FOUND");
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) return badRequest(res, "Indica las cantidades recibidas.", "PURCHASE_RECEIPT_EMPTY");
    exec("BEGIN TRANSACTION");
    try {
      const receiptId = insert("INSERT INTO purchase_receipts (purchase_order_id,received_at,notes) VALUES ($order,$date,$notes)", { order: order.id, date: req.body.received_at || new Date().toISOString(), notes: req.body.notes || "" });
      lines.forEach((item) => {
        const line = one("SELECT * FROM purchase_order_lines WHERE id=$id AND purchase_order_id=$order", { id: item.purchase_order_line_id, order: order.id });
        if (!line) throw new Error("Linea de recepcion no valida.");
        const quantity = Math.max(0, Number(item.quantity || 0));
        const pendingQuantity = Math.max(0, Number(line.ordered_quantity) - Number(line.received_quantity));
        if (quantity > pendingQuantity) throw new Error("La cantidad recibida supera las unidades pendientes.");
        insert("INSERT INTO purchase_receipt_lines (purchase_receipt_id,purchase_order_line_id,quantity) VALUES ($receipt,$line,$quantity)", { receipt: receiptId, line: line.id, quantity });
        exec("UPDATE purchase_order_lines SET received_quantity=received_quantity+$quantity,updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: line.id, quantity });
      });
      const pending = one(`SELECT COUNT(*) count FROM purchase_order_lines WHERE purchase_order_id=$id AND is_excluded=0 AND received_quantity<ordered_quantity`, { id: order.id }).count;
      const status = Number(pending) ? "partially_received" : "received";
      exec("UPDATE purchase_orders SET status=$status,received_at=CASE WHEN $status='received' THEN CURRENT_TIMESTAMP ELSE received_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: order.id, status });
      recalculatePlan(order.purchase_plan_id);
      audit("purchase_receipt", receiptId, "create", null, { order_id: order.id, status, stock_mutated: false });
      exec("COMMIT");
      saveDb();
      res.json({ receipt_id: receiptId, status, stock_mutated: false, warning: "La recepcion no modifica el stock. Sincroniza Shopify para reflejar el incremento." });
    } catch (error) { exec("ROLLBACK"); throw error; }
  });
}

module.exports = { registerPurchaseRoutes };
