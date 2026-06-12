const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
  const TEST_HEALTH_DIR = path.join(DATA_DIR, "health");
  const TEST_HEALTH_FILE = path.join(TEST_HEALTH_DIR, "test-health.json");
  const COVERAGE_SUMMARY_FILE = path.join(__dirname, "..", "..", "..", "coverage", "api", "coverage-summary.json");
  const AUTO_TEST_HEALTH_AFTER_SYNC = process.env.MUA_OPS_AUTO_TEST_HEALTH_AFTER_SYNC !== "0";
  let runningTestHealth = null;

  function readTestHealth() {
    if (!fs.existsSync(TEST_HEALTH_FILE)) {
      return {
        status: "unknown",
        running: false,
        last_run_at: "",
        duration_ms: 0,
        suites: [],
        coverage: null,
        history: [],
        summary: "Sin ejecuciones registradas"
      };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(TEST_HEALTH_FILE, "utf8"));
      return {
        status: "unknown",
        running: false,
        last_run_at: "",
        duration_ms: 0,
        suites: [],
        coverage: null,
        history: [],
        summary: "Sin ejecuciones registradas",
        ...parsed,
        history: Array.isArray(parsed?.history) ? parsed.history : []
      };
    } catch {
      return {
        status: "error",
        running: false,
        last_run_at: "",
        duration_ms: 0,
        suites: [],
        coverage: null,
        history: [],
        summary: "No se pudo leer el historial de tests"
      };
    }
  }

  function writeTestHealth(payload) {
    fs.mkdirSync(TEST_HEALTH_DIR, { recursive: true });
    fs.writeFileSync(TEST_HEALTH_FILE, JSON.stringify(payload, null, 2));
  }

  function runNodeSuite(scriptPath, env = {}) {
    return new Promise((resolve) => {
      const started = Date.now();
      let stdout = "";
      let stderr = "";
      const child = spawn(process.execPath, [scriptPath], {
        cwd: path.join(__dirname, "..", "..", ".."),
        env: { ...process.env, ...env }
      });
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          exit_code: code,
          duration_ms: Date.now() - started,
          output: `${stdout}\n${stderr}`.trim()
        });
      });
      child.on("error", (error) => {
        resolve({
          ok: false,
          exit_code: -1,
          duration_ms: Date.now() - started,
          output: String(error.message || error)
        });
      });
    });
  }

  function runCommandSuite(command, args = [], env = {}) {
    return new Promise((resolve) => {
      const started = Date.now();
      let stdout = "";
      let stderr = "";
      const child = spawn(command, args, {
        cwd: path.join(__dirname, "..", "..", ".."),
        env: { ...process.env, ...env }
      });
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          exit_code: code,
          duration_ms: Date.now() - started,
          output: `${stdout}\n${stderr}`.trim()
        });
      });
      child.on("error", (error) => {
        resolve({
          ok: false,
          exit_code: -1,
          duration_ms: Date.now() - started,
          output: String(error.message || error)
        });
      });
    });
  }

  function readCoverageSummary() {
    if (!fs.existsSync(COVERAGE_SUMMARY_FILE)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY_FILE, "utf8"));
      const total = parsed?.total || {};
      const metric = (key) => ({
        pct: Number(total?.[key]?.pct || 0),
        covered: Number(total?.[key]?.covered || 0),
        total: Number(total?.[key]?.total || 0)
      });
      return {
        scope: "backend_api",
        lines: metric("lines"),
        statements: metric("statements"),
        functions: metric("functions"),
        branches: metric("branches")
      };
    } catch {
      return null;
    }
  }

  function scheduleSystemVerification(baseUrl, reason = "manual") {
    if (!AUTO_TEST_HEALTH_AFTER_SYNC && reason !== "manual") return false;
    if (runningTestHealth?.running) return false;
    runningTestHealth = {
      ...(readTestHealth() || {}),
      running: true,
      status: "running",
      started_at: new Date().toISOString(),
      summary: `Verificacion automatica en curso (${reason})`
    };
    writeTestHealth(runningTestHealth);
    setTimeout(async () => {
      try {
        const result = await executeSystemTestHealth(baseUrl);
        runningTestHealth = null;
        audit("system", 0, "tests_run", null, { status: result.status, duration_ms: result.duration_ms, trigger: reason });
        saveDb();
      } catch (error) {
        writeTestHealth({
          status: "error",
          running: false,
          last_run_at: new Date().toISOString(),
          duration_ms: 0,
          suites: [],
          coverage: readCoverageSummary(),
          history: readTestHealth().history || [],
          summary: error.message || "No se pudieron ejecutar los tests"
        });
        runningTestHealth = null;
      }
    }, 0);
    return true;
  }

  async function executeSystemTestHealth(baseUrl) {
    const started = Date.now();
    const previous = readTestHealth();
    const c8Bin = path.join(__dirname, "..", "..", "..", "node_modules", "c8", "bin", "c8.js");
    const suites = [
      ["api", "API", path.join(__dirname, "..", "..", "test-api.js"), { MUA_OPS_TEST_PORT: "5165", MUA_OPS_TEST_SHOPIFY_PORT: "5166", MUA_OPS_SKIP_SYSTEM_TEST_HEALTH: "1" }],
      ["ui_smoke", "UI smoke", path.join(__dirname, "..", "..", "test-ui-smoke.js"), { MUA_OPS_UI_URL: baseUrl }],
      ["coverage", "Cobertura backend", c8Bin, { MUA_OPS_UI_URL: baseUrl, MUA_OPS_RUN_COVERAGE: "1", MUA_OPS_TEST_PORT: "5165", MUA_OPS_TEST_SHOPIFY_PORT: "5166", MUA_OPS_SKIP_SYSTEM_TEST_HEALTH: "1" }]
    ];
    const results = [];
    for (const [id, label, scriptPath, env] of suites) {
      const result = id === "coverage"
        ? await runCommandSuite(process.execPath, [
            scriptPath,
            "--reporter=json-summary",
            "--reporter=text-summary",
            "--report-dir",
            path.join("coverage", "api"),
            process.execPath,
            path.join(__dirname, "..", "..", "test-api.js")
          ], env)
        : await runNodeSuite(scriptPath, env);
      results.push({
        id,
        label,
        status: result.ok ? "ok" : "error",
        exit_code: result.exit_code,
        duration_ms: result.duration_ms,
        output: result.output
      });
      if (!result.ok) break;
    }
    const status = results.every((suite) => suite.status === "ok") ? "ok" : "error";
    const coverage = results.some((suite) => suite.id === "coverage" && suite.status === "ok") ? readCoverageSummary() : (previous.coverage || null);
    const payload = {
      status,
      running: false,
      last_run_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      suites: results,
      coverage,
      history: [
        {
          status,
          last_run_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          coverage: coverage
            ? {
                lines_pct: coverage.lines?.pct || 0,
                branches_pct: coverage.branches?.pct || 0,
                functions_pct: coverage.functions?.pct || 0,
                statements_pct: coverage.statements?.pct || 0
              }
            : null,
          suites: results.map((suite) => ({
            id: suite.id,
            label: suite.label,
            status: suite.status,
            duration_ms: suite.duration_ms
          }))
        },
        ...(Array.isArray(previous.history) ? previous.history : [])
      ].slice(0, 8),
      summary: status === "ok" ? "Verificacion automatica correcta" : "Alguna suite ha fallado"
    };
    writeTestHealth(payload);
    return payload;
  }

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

  app.get("/api/system/test-health", (req, res) => {
    const current = runningTestHealth || readTestHealth();
    res.json(current);
  });

  app.post("/api/system/test-health/run", async (req, res) => {
    if (runningTestHealth?.running) {
      return badRequest(res, new Error("Ya hay una verificacion en curso"), "TEST_HEALTH_RUNNING");
    }
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}/`;
      runningTestHealth = {
        ...(readTestHealth() || {}),
        running: true,
        status: "running",
        started_at: new Date().toISOString(),
        summary: "Ejecutando verificacion automatica"
      };
      writeTestHealth(runningTestHealth);
      const result = await executeSystemTestHealth(baseUrl);
      runningTestHealth = null;
      audit("system", 0, "tests_run", null, { status: result.status, duration_ms: result.duration_ms });
      saveDb();
      res.json(result);
    } catch (error) {
      const failed = {
        status: "error",
        running: false,
        last_run_at: new Date().toISOString(),
        duration_ms: 0,
        suites: [],
        coverage: readCoverageSummary(),
        summary: error.message || "No se pudieron ejecutar los tests"
      };
      writeTestHealth(failed);
      runningTestHealth = null;
      badRequest(res, error, "TEST_HEALTH_FAILED");
    }
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
      const verificationScheduled = scheduleSystemVerification(`${req.protocol}://${req.get("host")}/`, "shopify_sync_all");
      res.json({ ...result, verification_scheduled: verificationScheduled });
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_FAILED", { status: shopifySyncStatus() });
    }
  });

  app.post("/api/shopify/sync/products", async (req, res) => {
    try {
      const result = await runShopifySync("products");
      const verificationScheduled = scheduleSystemVerification(`${req.protocol}://${req.get("host")}/`, "shopify_sync_products");
      res.json({ ...result, verification_scheduled: verificationScheduled });
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_PRODUCTS_FAILED");
    }
  });

  app.post("/api/shopify/sync/inventory", async (req, res) => {
    try {
      const result = await runShopifySync("inventory");
      const verificationScheduled = scheduleSystemVerification(`${req.protocol}://${req.get("host")}/`, "shopify_sync_inventory");
      res.json({ ...result, verification_scheduled: verificationScheduled });
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_INVENTORY_FAILED");
    }
  });

  app.post("/api/shopify/sync/orders", async (req, res) => {
    try {
      const result = await runShopifySync("orders", { full: Boolean(req.body?.full) });
      const verificationScheduled = scheduleSystemVerification(`${req.protocol}://${req.get("host")}/`, "shopify_sync_orders");
      res.json({ ...result, verification_scheduled: verificationScheduled });
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_ORDERS_FAILED");
    }
  });

  app.post("/api/shopify/sync/payouts", async (req, res) => {
    try {
      const result = await runShopifySync("payouts");
      const verificationScheduled = scheduleSystemVerification(`${req.protocol}://${req.get("host")}/`, "shopify_sync_payouts");
      res.json({ ...result, verification_scheduled: verificationScheduled });
    } catch (error) {
      badRequest(res, error, "SHOPIFY_SYNC_PAYOUTS_FAILED");
    }
  });
}

module.exports = { registerSystemRoutes };
