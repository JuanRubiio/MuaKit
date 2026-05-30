function registerIncomeRoutes(app, ctx) {
  const {
    query,
    one,
    n,
    optionalN,
    saveDb,
    audit,
    badRequest,
    notFound,
    incomeSummary,
    payoutImportHistory,
    payoutPayload,
    normalizePayoutBody,
    upsertChannelPayout,
    nowPatch,
    exec,
    softDelete,
    restore,
    importShopifyPayouts,
    importEtsyPayouts
  } = ctx;

  app.get("/api/income/summary", (req, res) => {
    res.json(incomeSummary());
  });

  app.get("/api/income/imports", (req, res) => {
    res.json(payoutImportHistory());
  });

  app.get("/api/channel-payouts", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    const rows = query(
      `SELECT p.*, c.label AS channel_label
       FROM channel_payouts p
       LEFT JOIN sales_channels c ON c.code = p.channel
       WHERE ($includeDeleted=1 OR p.is_deleted=0)
       ORDER BY p.is_deleted, p.payout_date DESC, p.id DESC`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    );
    res.json(rows.map(payoutPayload));
  });

  app.get("/api/channel-payouts/:id", (req, res) => {
    const row = one(
      `SELECT p.*, c.label AS channel_label
       FROM channel_payouts p
       LEFT JOIN sales_channels c ON c.code = p.channel
       WHERE p.id=$id`,
      { id: req.params.id }
    );
    if (!row) return notFound(res, "Payout no encontrado", "PAYOUT_NOT_FOUND");
    res.json(payoutPayload(row));
  });

  app.post("/api/channel-payouts", (req, res) => {
    const payload = normalizePayoutBody(req.body || {});
    if (!payload.external_id) {
      payload.external_id = `manual|${payload.channel}|${payload.payout_date}|${payload.net_amount}|${Date.now()}`;
    }
    const result = upsertChannelPayout(payload, "manual");
    saveDb();
    res.json(result.row);
  });

  app.patch("/api/channel-payouts/:id", (req, res) => {
    const before = one("SELECT * FROM channel_payouts WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Payout no encontrado", "PAYOUT_NOT_FOUND");
    const fields = [
      "channel", "external_id", "payout_date", "status", "currency", "gross_amount", "refunds_amount",
      "adjustments_amount", "advances_amount", "reserves_amount", "fees_amount", "tax_withheld_amount",
      "retried_amount", "net_amount", "bank_reference", "bank_account_hint", "raw_source_file", "notes"
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!fields.length) return res.json(payoutPayload(before));
    const params = { id: req.params.id };
    for (const field of fields) {
      if (["gross_amount", "refunds_amount", "adjustments_amount", "advances_amount", "reserves_amount", "fees_amount", "tax_withheld_amount", "retried_amount", "net_amount"].includes(field)) {
        params[field] = n(req.body[field]);
      } else if (field === "external_id") {
        params[field] = String(req.body[field] || before.external_id || `manual|${before.channel}|${before.payout_date}|${before.net_amount}`).trim();
      } else {
        params[field] = req.body[field] === "" ? null : req.body[field];
      }
    }
    exec(`UPDATE channel_payouts SET ${nowPatch("channel_payouts", fields)} WHERE id=$id`, params);
    const after = payoutPayload(one("SELECT * FROM channel_payouts WHERE id=$id", { id: req.params.id }));
    audit("channel_payout", Number(req.params.id), "update", before, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/channel-payouts/:id", (req, res) => softDelete("channel_payouts", "channel_payout", req.params.id, res));
  app.post("/api/channel-payouts/:id/restore", (req, res) => restore("channel_payouts", "channel_payout", req.params.id, res));

  app.post("/api/import/payouts/shopify", (req, res) => {
    res.json(importShopifyPayouts());
  });

  app.post("/api/import/payouts/etsy", (req, res) => {
    res.json(importEtsyPayouts());
  });
}

module.exports = { registerIncomeRoutes };
