function registerSystemRoutes(app, ctx) {
  const {
    DB_FILE,
    DATA_DIR,
    UPLOAD_DIR,
    query,
    tableCount,
    SCHEMA_MIGRATIONS,
    packageInfo,
    systemHealth,
    shopifyConnectionPayload,
    createDbBackup,
    audit,
    saveDb,
    settingsObject,
    updateSettings,
    shopifyConnectionForUse,
    DEFAULT_SHOPIFY_API_VERSION,
    updateShopifyConnection,
    testShopifyConnection,
    shopifySyncStatus,
    runShopifySync,
    badRequest
  } = ctx;

  app.get("/api/summary", (req, res) => {
    res.json({
      materials: tableCount("materials"),
      shopify_products: tableCount("shopify_products"),
      suppliers: query("SELECT COUNT(*) AS c FROM suppliers WHERE is_deleted=0")[0].c,
      invoices: query("SELECT COUNT(*) AS c FROM invoices WHERE is_deleted=0")[0].c,
      payouts: query("SELECT COUNT(*) AS c FROM channel_payouts WHERE is_deleted=0")[0].c,
      documents: query("SELECT COUNT(*) AS c FROM documents WHERE is_deleted=0")[0].c,
      db_path: DB_FILE
    });
  });

  app.get("/api/system/health", (req, res) => {
    res.json(systemHealth({
      dbFile: DB_FILE,
      dataDir: DATA_DIR,
      uploadDir: UPLOAD_DIR,
      query,
      expectedMigrations: SCHEMA_MIGRATIONS,
      packageInfo,
      shopifyConnectionPayload
    }));
  });

  app.post("/api/system/backup", (req, res) => {
    try {
      const backup = createDbBackup({ dbFile: DB_FILE, dataDir: DATA_DIR, reason: req.body?.reason || "manual" });
      audit("system", 0, "backup_create", null, backup);
      saveDb();
      res.json(backup);
    } catch (error) {
      badRequest(res, error, "BACKUP_FAILED");
    }
  });

  app.get("/api/settings", (req, res) => {
    res.json(settingsObject());
  });

  app.patch("/api/settings", (req, res) => {
    res.json(updateSettings(req.body || {}));
  });

  app.get("/api/shopify/connection", (req, res) => {
    res.json(shopifyConnectionPayload());
  });

  app.patch("/api/shopify/connection", (req, res) => {
    try {
      res.json(updateShopifyConnection(req.body || {}));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_CONNECTION_INVALID");
    }
  });

  app.post("/api/shopify/connection/test", async (req, res) => {
    try {
      const current = shopifyConnectionForUse();
      const override = {
        ...current,
        store_domain: Object.prototype.hasOwnProperty.call(req.body || {}, "store_domain") ? String(req.body.store_domain || "").trim() : current.store_domain,
        admin_token: Object.prototype.hasOwnProperty.call(req.body || {}, "admin_token") && String(req.body.admin_token || "").trim()
          ? String(req.body.admin_token || "").trim()
          : current.admin_token,
        client_id: Object.prototype.hasOwnProperty.call(req.body || {}, "client_id") && String(req.body.client_id || "").trim()
          ? String(req.body.client_id || "").trim()
          : current.client_id,
        client_secret: Object.prototype.hasOwnProperty.call(req.body || {}, "client_secret") && String(req.body.client_secret || "").trim()
          ? String(req.body.client_secret || "").trim()
          : current.client_secret,
        api_version: Object.prototype.hasOwnProperty.call(req.body || {}, "api_version") ? String(req.body.api_version || DEFAULT_SHOPIFY_API_VERSION).trim() || DEFAULT_SHOPIFY_API_VERSION : current.api_version
      };
      res.json(await testShopifyConnection(override));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_CONNECTION_TEST_FAILED");
    }
  });

  app.get("/api/shopify/sync-status", (req, res) => {
    res.json(shopifySyncStatus());
  });

  app.post("/api/shopify/sync", async (req, res) => {
    try {
      const result = await runShopifySync("all");
      res.json(result);
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_FAILED", { status: shopifySyncStatus() });
    }
  });

  app.post("/api/shopify/sync/products", async (req, res) => {
    try {
      res.json(await runShopifySync("products"));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_PRODUCTS_FAILED");
    }
  });

  app.post("/api/shopify/sync/inventory", async (req, res) => {
    try {
      res.json(await runShopifySync("inventory"));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_INVENTORY_FAILED");
    }
  });

  app.post("/api/shopify/sync/orders", async (req, res) => {
    try {
      res.json(await runShopifySync("orders"));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_ORDERS_FAILED");
    }
  });

  app.post("/api/shopify/sync/payouts", async (req, res) => {
    try {
      res.json(await runShopifySync("payouts"));
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_PAYOUTS_FAILED");
    }
  });
}

module.exports = { registerSystemRoutes };
