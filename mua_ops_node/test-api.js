const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const initSqlJs = require("sql.js");

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(__dirname, "server.js");
const TEST_DIR = path.join(ROOT, "data", `mua_ops_test_${process.pid}_${Date.now()}`);
const PORT = Number(process.env.MUA_OPS_TEST_PORT || 5065);
const SHOPIFY_MOCK_PORT = Number(process.env.MUA_OPS_TEST_SHOPIFY_PORT || 5066);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmWithRetry(target) {
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY"].includes(error.code) || attempt === 5) throw error;
      sleepMs(150 * (attempt + 1));
    }
  }
  if (lastError) throw lastError;
}

function cleanTestDir() {
  const resolved = path.resolve(TEST_DIR);
  assert(resolved.startsWith(path.join(ROOT, "data")), "Test directory must stay inside data/");
  rmWithRetry(resolved);
  fs.mkdirSync(resolved, { recursive: true });
}

function createMockShopifyServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/admin/oauth/access_token") {
      let body = "";
      for await (const chunk of req) body += chunk.toString();
      const params = new URLSearchParams(body);
      if (
        params.get("grant_type") === "client_credentials"
        && params.get("client_id") === "shpui_test_client"
        && params.get("client_secret") === "shpss_test_secret"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          access_token: "mock_access_token_1234",
          scope: "read_products,read_inventory,read_orders,read_shopify_payments_payouts",
          expires_in: 86399
        }));
        return;
      }
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_client", error_description: "Client credentials rejected by mock Shopify" }));
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/admin/api/2026-01/shopify_payments/payouts.json")) {
      if (req.headers["x-shopify-access-token"] !== "mock_access_token_1234") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errors: "Missing or invalid access token" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        payouts: [
          {
            id: 623721858,
            date: "2026-05-15",
            status: "paid",
            currency: "EUR",
            amount: "441.06",
            bank_reference: "trace-44106",
            type: "deposit",
            summary: {
              charges_gross_amount: "452.36",
              charges_fee_amount: "11.30"
            }
          }
        ]
      }));
      return;
    }
    if (req.method !== "POST" || !req.url.includes("/admin/api/2026-01/graphql.json")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    if (req.headers["x-shopify-access-token"] !== "mock_access_token_1234") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ errors: [{ message: "Missing or invalid access token" }] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    const payload = JSON.parse(body || "{}");
    const query = String(payload.query || "");
    let data = {};
    if (query.includes("shop {")) {
      data = { shop: { name: "Mua Kit Test", myshopifyDomain: "muakit-test.myshopify.com" } };
    } else if (query.includes("query ShopifyProducts")) {
      data = {
        products: {
          edges: [
            {
              cursor: "product-1",
              node: {
                id: "gid://shopify/Product/1",
                handle: "cadena-incluida-dorada-acero",
                title: "Cadena incluida dorada (acero)",
                status: "ACTIVE",
                updatedAt: "2026-05-15T10:00:00Z",
                featuredImage: { url: "https://cdn.shopify.com/mock/cadena-dorada.jpg" },
                images: { edges: [{ node: { url: "https://cdn.shopify.com/mock/cadena-dorada.jpg" } }] },
                variants: { edges: [{ node: { sku: "CAD-DOR-001", inventoryQuantity: 18 } }] }
              }
            },
            {
              cursor: "product-2",
              node: {
                id: "gid://shopify/Product/2",
                handle: "anillo-corazon-plateado-acero",
                title: "Anillo Corazón plateado (acero)",
                status: "ACTIVE",
                updatedAt: "2026-05-15T10:05:00Z",
                featuredImage: { url: "https://cdn.shopify.com/mock/anillo-corazon.jpg" },
                images: { edges: [{ node: { url: "https://cdn.shopify.com/mock/anillo-corazon.jpg" } }] },
                variants: { edges: [{ node: { sku: "ANI-PLA-001", inventoryQuantity: 12 } }] }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    } else if (query.includes("query ShopifyInventory")) {
      data = {
        products: {
          edges: [
            {
              cursor: "inventory-1",
              node: {
                handle: "cadena-incluida-dorada-acero",
                title: "Cadena incluida dorada (acero)",
                status: "ACTIVE",
                variants: { edges: [{ node: { sku: "CAD-DOR-001", inventoryQuantity: 20 } }] }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    } else if (query.includes("query ShopifyOrders")) {
      data = {
        orders: {
          edges: [
            {
              cursor: "order-1",
              node: {
                id: "gid://shopify/Order/1001",
                name: "#1001",
                createdAt: "2026-05-14T12:00:00Z",
                updatedAt: "2026-05-15T08:00:00Z",
                displayFinancialStatus: "PAID",
                displayFulfillmentStatus: "UNFULFILLED",
                currentTotalPriceSet: { shopMoney: { amount: "89.90", currencyCode: "EUR" } },
                currentSubtotalPriceSet: { shopMoney: { amount: "79.90", currencyCode: "EUR" } },
                currentTotalDiscountsSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } },
                totalShippingPriceSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } },
                totalTaxSet: { shopMoney: { amount: "10.00", currencyCode: "EUR" } },
                lineItems: {
                  nodes: [
                    {
                      id: "gid://shopify/LineItem/1001-1",
                      title: "Cadena incluida dorada (acero)",
                      quantity: 1,
                      sku: "CAD-DOR-001",
                      originalTotalSet: { shopMoney: { amount: "24.95", currencyCode: "EUR" } },
                      discountedTotalSet: { shopMoney: { amount: "24.95", currencyCode: "EUR" } },
                      totalDiscountSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } }
                    },
                    {
                      id: "gid://shopify/LineItem/1001-2",
                      title: "Anillo Corazón plateado (acero)",
                      quantity: 2,
                      sku: "ANI-PLA-001",
                      originalTotalSet: { shopMoney: { amount: "54.95", currencyCode: "EUR" } },
                      discountedTotalSet: { shopMoney: { amount: "49.95", currencyCode: "EUR" } },
                      totalDiscountSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } }
                    }
                  ]
                }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
  return new Promise((resolve) => {
    server.listen(SHOPIFY_MOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function requestRaw(method, route, body) {
  const options = { method, headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${route}`, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload, text };
}

async function request(method, route, body) {
  const { response, payload, text } = await requestRaw(method, route, body);
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${text}`);
  }
  return payload;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      await request("GET", "/api/summary");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Server did not start in time");
}

async function run() {
  cleanTestDir();
  const mockShopifyServer = await createMockShopifyServer();
  let serverOutput = "";
  let child = null;

  function startTestServer() {
    const proc = spawn(process.execPath, [SERVER, "--port", String(PORT)], {
      cwd: ROOT,
      env: {
        ...process.env,
        MUA_OPS_DATA_DIR: TEST_DIR,
        MUA_OPS_DB_FILE: path.join(TEST_DIR, "mua_ops_test.sqlite"),
        MUA_OPS_LEGACY_JSON: path.join(TEST_DIR, "empty.json"),
        MUA_OPS_AUTO_TEST_HEALTH_AFTER_SYNC: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    proc.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
    return proc;
  }

  async function stopTestServer() {
    if (!child) return;
    const proc = child;
    child = null;
    proc.kill();
    await new Promise((resolve) => proc.once("exit", resolve));
  }

  child = startTestServer();

  try {
    await waitForServer();

    const summary = await request("GET", "/api/summary");
    assert(summary.db_path.endsWith("mua_ops_test.sqlite"), "Summary should use the test database");
    assert(typeof summary.payouts === "number", "Summary should include payout count");

    const initialDashboard = await request("GET", "/api/dashboard/finance");
    assert(initialDashboard.kpis, "Dashboard finance should include KPIs");
    assert(Array.isArray(initialDashboard.monthly_spend), "Dashboard finance should include monthly spend");
    assert(initialDashboard.monthly_breakdown?.series?.total, "Dashboard finance should include monthly breakdown");
    assert(Array.isArray(initialDashboard.category_spend), "Dashboard finance should include category spend");
    assert(Array.isArray(initialDashboard.top_suppliers), "Dashboard finance should include top suppliers");
    assert(Array.isArray(initialDashboard.top_materials), "Dashboard finance should include top materials");

    const initialHealth = await request("GET", "/api/system/health");
    assert(initialHealth.ok === true, "System health should be ok on a fresh database");
    assert(initialHealth.database.integrity === "ok", "System health should expose SQLite integrity");
    assert(initialHealth.schema.pending_migrations.length === 0, "System health should have no pending migrations");
    assert(initialHealth.schema.applied_migrations.length >= 2, "System health should expose applied migrations");

    const manualBackup = await request("POST", "/api/system/backup", { reason: "api-test" });
    assert(manualBackup.created === true, "Manual system backup should be created");
    assert(fs.existsSync(manualBackup.file), "Manual system backup file should exist");

    const missingPayout = await requestRaw("GET", "/api/channel-payouts/999999");
    assert(missingPayout.response.status === 404, "API errors should preserve HTTP status");
    assert(missingPayout.payload.code === "PAYOUT_NOT_FOUND", "API errors should expose a stable code");

    const settings = await request("GET", "/api/settings");
    assert(settings.dashboard_monthly_view === "total", "Settings should expose default dashboard monthly view");
    assert(settings.dashboard_income_monthly_view === "cobros", "Settings should expose default income dashboard view");
    const updatedSettings = await request("PATCH", "/api/settings", {
      dashboard_monthly_view: "marketing",
      dashboard_income_monthly_view: "channel_shopify",
      default_invoice_status: "posted",
      default_payout_channel: "bizum",
      dashboard_color_bizum: "#c18a3a"
    });
    assert(updatedSettings.dashboard_monthly_view === "marketing", "Settings should be editable");
    assert(updatedSettings.dashboard_income_monthly_view === "channel_shopify", "Settings should persist income dashboard defaults");
    assert(updatedSettings.default_invoice_status === "posted", "Settings should persist invoice defaults");
    assert(updatedSettings.default_payout_channel === "bizum", "Settings should persist payout defaults");

    const shopifyConnection = await request("PATCH", "/api/shopify/connection", {
      store_domain: `http://127.0.0.1:${SHOPIFY_MOCK_PORT}`,
      client_id: "shpui_test_client",
      client_secret: "shpss_test_secret",
      api_version: "2026-01",
      sync_enabled: true,
      sync_interval_minutes: 60,
      pull_products: true,
      pull_inventory: true,
      pull_orders: true,
      pull_payouts: true
    });
    assert(shopifyConnection.credentials_configured === true, "Shopify connection should persist client credentials server-side");

    const connectionStatus = await request("GET", "/api/shopify/connection");
    assert(connectionStatus.client_id_masked.endsWith("ient"), "Shopify connection should only expose a masked client id");
    assert(connectionStatus.client_secret_masked.endsWith("cret"), "Shopify connection should only expose a masked client secret");
    assert(connectionStatus.auth_mode === "client_credentials", "Shopify connection should detect client credentials auth");
    const scopedConnection = await request("PATCH", "/api/shopify/connection", {
      pull_products: false,
      pull_inventory: true,
      pull_orders: false,
      pull_payouts: true
    });
    assert(scopedConnection.store_domain === `http://127.0.0.1:${SHOPIFY_MOCK_PORT}`, "Partial Shopify updates must preserve the domain");
    assert(scopedConnection.pull_products === false && scopedConnection.pull_orders === false, "Shopify sync scope should persist disabled resources");
    const scopedConnectionReloaded = await request("GET", "/api/shopify/connection");
    assert(scopedConnectionReloaded.pull_products === false && scopedConnectionReloaded.pull_orders === false, "Shopify sync scope should survive reload");
    await request("PATCH", "/api/shopify/connection", { pull_products: true, pull_orders: true });
    const healthWithShopify = await request("GET", "/api/system/health");
    const healthText = JSON.stringify(healthWithShopify);
    assert(!healthText.includes("shpss_test_secret"), "System health must not expose Shopify client secret");
    assert(!healthText.includes("mock_access_token_1234"), "System health must not expose Shopify access tokens");

    const connectionTest = await request("POST", "/api/shopify/connection/test", {});
    assert(connectionTest.ok === true, "Shopify connection test should succeed against mock server");

    const firstShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(firstShopifySync.products?.rows > 0, "Shopify sync should import products");
    assert(firstShopifySync.inventory?.rows > 0, "Shopify sync should import inventory");
    assert(firstShopifySync.orders?.rows > 0, "Shopify sync should import orders");
    assert(firstShopifySync.payouts?.rows > 0, "Shopify sync should import payouts");
    assert(firstShopifySync.verification_scheduled === false, "Automatic verification should stay disabled in API tests");

    const secondShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(secondShopifySync.products?.created === 0, "Shopify product sync should be idempotent on second run");

    const shopifySyncStatus = await request("GET", "/api/shopify/sync-status");
    assert(shopifySyncStatus.last_sync_status === "ok", "Shopify sync status should record successful syncs");
    assert(shopifySyncStatus.last_products_sync_at, "Shopify sync status should retain per-block timestamps");
    assert(shopifySyncStatus.pull_products === true && shopifySyncStatus.pull_orders === true, "Shopify sync status should expose active sync scopes");

    const previousOrdersSyncAt = shopifySyncStatus.last_orders_sync_at;
    const previousProductsSyncAt = shopifySyncStatus.last_products_sync_at;
    await request("PATCH", "/api/shopify/connection", {
      pull_products: false,
      pull_inventory: false,
      pull_orders: true,
      pull_payouts: false
    });
    const scopedSync = await request("POST", "/api/shopify/sync", {});
    assert(scopedSync.products === null, "Shopify sync should skip disabled product scope");
    assert(scopedSync.inventory === null, "Shopify sync should skip disabled inventory scope");
    assert(scopedSync.payouts === null, "Shopify sync should skip disabled payouts scope");
    assert(scopedSync.orders?.status === "ok", "Shopify sync should still execute enabled order scope");
    assert(scopedSync.verification_scheduled === false, "Scoped sync should also report auto verification as disabled in test mode");
    const scopedStatusAfterSync = await request("GET", "/api/shopify/sync-status");
    assert(scopedStatusAfterSync.last_orders_sync_at && scopedStatusAfterSync.last_orders_sync_at !== previousOrdersSyncAt, "Order sync timestamp should advance when orders scope runs");
    assert(scopedStatusAfterSync.last_products_sync_at === previousProductsSyncAt, "Product sync timestamp should stay untouched when products scope is disabled");
    await request("PATCH", "/api/shopify/connection", {
      pull_products: true,
      pull_inventory: true,
      pull_orders: true,
      pull_payouts: true
    });

    const shopifyImport = await request("POST", "/api/import/payouts/shopify", {});
    assert(shopifyImport.rows_total > 0, "Shopify payouts import should read rows");
    assert(shopifyImport.rows_created > 0, "Shopify payouts import should create payouts");

    const etsyImport = await request("POST", "/api/import/payouts/etsy", {});
    assert(etsyImport.rows_total > 0, "Etsy payouts import should read rows");
    assert(etsyImport.rows_created > 0, "Etsy payouts import should create deposits");

    const secondShopifyImport = await request("POST", "/api/import/payouts/shopify", {});
    assert(secondShopifyImport.rows_created === 0, "Shopify payouts reimport should be idempotent");

    const incomeSummary = await request("GET", "/api/income/summary");
    assert(incomeSummary.payout_count > 0, "Income summary should include imported payouts");
    assert(incomeSummary.total_net_amount > 0, "Income summary should aggregate net payouts");

    const payoutImports = await request("GET", "/api/income/imports");
    assert(payoutImports.length >= 2, "Income imports should track payout imports");

    const payouts = await request("GET", "/api/channel-payouts");
    assert(payouts.some((row) => row.channel === "shopify"), "Channel payouts should include Shopify rows");
    assert(payouts.some((row) => row.channel === "etsy"), "Channel payouts should include Etsy rows");
    assert(payouts.some((row) => row.external_id === "shopify_payout:623721858"), "Shopify direct sync should persist API payouts");

    const manualPayout = await request("POST", "/api/channel-payouts", {
      channel: "bizum",
      payout_date: "2026-03-31",
      status: "paid",
      currency: "EUR",
      gross_amount: 100,
      fees_amount: 0,
      net_amount: 100,
      notes: "Manual payout test"
    });
    assert(manualPayout.id, "Manual payout should be created");
    assert(manualPayout.channel === "bizum", "Manual payout should allow Bizum channel");
    const editedPayout = await request("PATCH", `/api/channel-payouts/${manualPayout.id}`, {
      notes: "Manual payout edited",
      bank_reference: "TESTBANK001"
    });
    assert(editedPayout.bank_reference === "TESTBANK001", "Payout should be editable");
    const archivedPayout = await request("DELETE", `/api/channel-payouts/${manualPayout.id}`);
    assert(archivedPayout.is_deleted === 1, "Payout should be archivable");
    const restoredPayout = await request("POST", `/api/channel-payouts/${manualPayout.id}/restore`);
    assert(restoredPayout.is_deleted === 0, "Payout should be restorable");

    const duplicateSeed = await request("POST", "/api/channel-payouts", {
      channel: "shopify",
      external_id: "shopify|2026-05-20|441.06|csv-ref",
      payout_date: "2026-05-20",
      status: "paid",
      currency: "EUR",
      gross_amount: 452.36,
      fees_amount: 11.30,
      net_amount: 441.06,
      bank_reference: "csv-ref",
      notes: "Seeded from CSV-style import"
    });
    const duplicateUpdate = await request("POST", "/api/channel-payouts", {
      channel: "shopify",
      external_id: "gid://shopify/ShopifyPaymentsPayout/999",
      payout_date: "2026-05-20",
      status: "paid",
      currency: "EUR",
      gross_amount: 452.36,
      fees_amount: 11.30,
      net_amount: 441.06,
      notes: "Updated from API sync"
    });
    assert(duplicateUpdate.id === duplicateSeed.id, "Equivalent Shopify payouts should deduplicate across sources");
    assert(duplicateUpdate.external_id === "gid://shopify/ShopifyPaymentsPayout/999", "API payout id should replace fallback CSV-style id when matched");

    const supplier = await request("POST", "/api/suppliers", {
      name: "Test Supplier",
      category: "materiales",
      website: "https://example.com",
      lead_time_days: 7,
      notes: "Created by API test"
    });
    assert(supplier.id, "Supplier should be created");

    const editedSupplier = await request("PATCH", `/api/suppliers/${supplier.id}`, { lead_time_days: 9 });
    assert(editedSupplier.lead_time_days === 9, "Supplier should be editable");
    const archivedSupplier = await request("DELETE", `/api/suppliers/${supplier.id}`);
    assert(archivedSupplier.is_deleted === 1, "Supplier should be archived");
    const restoredSupplier = await request("POST", `/api/suppliers/${supplier.id}/restore`);
    assert(restoredSupplier.is_deleted === 0, "Supplier should be restored");

    const material = await request("POST", "/api/materials", {
      name: "Cadena acero banado dorado test",
      category: "cadena",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      manual_stock: 0,
      reorder_point: 10,
      target_stock: 50,
      notes: "Created by API test"
    });
    assert(material.id, "Material should be created");

    const products = await request("GET", "/api/shopify-products?q=cadena");
    assert(products.some((row) => row.handle === "cadena-incluida-dorada-acero"), "Shopify direct sync should expose imported products");
    if (products.length) {
      const linked = await request("PATCH", `/api/shopify-products/${products[0].id}`, { material_id: material.id });
      assert(linked.material_id === material.id, "Shopify product should link to a material");
    }

    const fixturePath = path.join(TEST_DIR, "sample-invoice.txt");
    fs.writeFileSync(fixturePath, "Sample invoice for Mua Ops API test");
    const form = new FormData();
    form.append("document", new Blob([fs.readFileSync(fixturePath)], { type: "text/plain" }), "sample-invoice.txt");
    form.append("related_entity", "invoice");
    const document = await request("POST", "/api/documents", form);
    assert(fs.existsSync(document.stored_path), "Uploaded document should be copied to uploads");

    const invoice = await request("POST", "/api/invoices", {
      supplier_id: supplier.id,
      document_id: document.id,
      invoice_number: "TEST-001",
      invoice_date: "2026-01-23",
      category: "materiales",
      subtotal: 16.76,
      discount: 0,
      shipping: 4,
      tax: 0,
      total: 20.76,
      currency: "EUR",
      status: "posted",
      notes: "API test invoice"
    });
    assert(invoice.id, "Invoice should be created");

    const line = await request("POST", `/api/invoices/${invoice.id}/lines`, {
      material_id: material.id,
      description: "4 paquetes x 5 unidades a 4,19 EUR",
      package_count: 4,
      units_per_package: 5,
      price_per_package: 4.19,
      affects_stock: true
    });
    assert(line.total_units === 20, "Line should calculate total units");
    assert(Math.abs(line.unit_price - 0.838) < 0.0001, "Line should calculate unit cost");

    let costs = await request("GET", "/api/costs/materials");
    let materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 1, "Costs should include active invoice line");
    assert(Math.abs(materialCost.weighted_avg_unit_cost_inc_vat - 0.838) < 0.0001, "Weighted cost should match line cost");

    const editedLine = await request("PATCH", `/api/invoices/${invoice.id}/lines/${line.id}`, {
      material_id: material.id,
      description: line.description,
      package_count: 4,
      units_per_package: 5,
      price_per_package: 5,
      affects_stock: true
    });
    assert(Math.abs(editedLine.unit_price - 1) < 0.0001, "Edited line should recalculate unit cost");

    const duplicatedLine = await request("POST", `/api/invoices/${invoice.id}/lines/${line.id}/duplicate`);
    assert(duplicatedLine.total_units === 20, "Duplicated line should preserve units");
    assert(Math.abs(duplicatedLine.unit_price - 1) < 0.0001, "Duplicated line should preserve unit cost without shipping allocation");

    const archivedInvoice = await request("DELETE", `/api/invoices/${invoice.id}`);
    assert(archivedInvoice.is_deleted === 1, "Invoice should be archived");
    costs = await request("GET", "/api/costs/materials");
    materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 2, "Archived material invoice should keep contributing to costs");

    const restoredInvoice = await request("POST", `/api/invoices/${invoice.id}/restore`);
    assert(restoredInvoice.is_deleted === 0, "Invoice should be restored");
    costs = await request("GET", "/api/costs/materials");
    materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 2, "Restored invoice should affect costs again");

    const kitRecipe = await request("POST", "/api/kit-recipes", {
      name: "Kit test base",
      version: "maternal",
      is_default: true,
      notes: "API test fixed set"
    });
    assert(kitRecipe.id, "Kit recipe should be created");
    assert(Number(kitRecipe.is_default) === 1, "Kit recipe should be markable as default");

    const kitItem = await request("POST", `/api/kit-recipes/${kitRecipe.id}/items`, {
      material_id: material.id,
      quantity: 2,
      notes: "Component included by default"
    });
    assert(kitItem.id, "Kit recipe item should be created");

    let kits = await request("GET", "/api/kit-recipes");
    let defaultKit = kits.find((row) => row.id === kitRecipe.id);
    assert(defaultKit.item_count === 1, "Kit recipe should expose item count");
    assert(defaultKit.included_item_count === 1, "Kit recipe should count included components");
    assert(defaultKit.excluded_item_count === 0, "Kit recipe should count excluded components");
    assert(Math.abs(defaultKit.known_cost - 2) < 0.0001, "Kit recipe should include component cost in known cost");
    assert(defaultKit.missing_cost_items === 0, "Kit recipe should not mark included costed components as missing");

    const excludedKitItem = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: false
    });
    assert(Number(excludedKitItem.include_in_cost) === 0, "Kit item should be excludable from fixed set cost");
    kits = await request("GET", "/api/kit-recipes");
    defaultKit = kits.find((row) => row.id === kitRecipe.id);
    assert(defaultKit.included_item_count === 0, "Excluded kit items should not count as included");
    assert(defaultKit.excluded_item_count === 1, "Excluded kit items should count as excluded");
    assert(Math.abs(defaultKit.known_cost) < 0.0001, "Excluded kit item should not contribute to fixed set cost");
    assert(defaultKit.missing_cost_items === 0, "Excluded kit item should not count as missing cost");

    const includedKitItem = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: true
    });
    assert(Number(includedKitItem.include_in_cost) === 1, "Kit item should be includable again");
    const completedKit = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}`, { is_complete: true });
    assert(Number(completedKit.is_complete) === 1, "Kit recipe should be markable as complete");
    const completeToggleAttempt = await requestRaw("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: false
    });
    assert(completeToggleAttempt.response.status === 400, "Completed kit recipe should block item inclusion edits");
    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}`, { is_complete: false });

    const orderSyncAfterCost = await request("POST", "/api/shopify/sync/orders", { full: true });
    assert(orderSyncAfterCost.orders?.rows > 0, "Full Shopify order sync should import order lines");
    let profitability = await request("GET", "/api/orders/profitability");
    assert(profitability.fixed_sets.some((row) => row.id === kitRecipe.id), "Order profitability should expose fixed sets");
    assert(profitability.active_set?.id === kitRecipe.id, "Order profitability should use the default fixed set");
    const profitableOrder = profitability.orders.find((order) => (order.lines || []).some((orderLine) => orderLine.material_id === material.id && orderLine.total_cost != null));
    assert(profitableOrder, "Order profitability should expose synced order lines with linked materials");
    const missingCostLines = profitableOrder.lines.filter((orderLine) => orderLine.material_id && orderLine.unit_cost == null);
    assert(missingCostLines.length > 0, "Fixture order should include Shopify lines without registered cost");
    assert(missingCostLines.every((orderLine) => Number(orderLine.include_in_cost) === 0), "Shopify lines without cost should be excluded automatically");
    assert(profitableOrder.status === "complete", "Orders with only excluded missing-cost lines should remain complete");
    assert(profitableOrder.missing_line_costs === 0, "Excluded missing-cost lines should not count as pending cost");
    assert(profitableOrder.fixed_set_cost > 0, "Order profitability should include fixed set cost");
    assert(profitableOrder.real_cost >= profitableOrder.fixed_set_cost, "Order real cost should include fixed set and content cost");
    const blockedInclusionAttempt = await requestRaw("PATCH", `/api/order-lines/${missingCostLines[0].id}/include`, {
      include_in_cost: true
    });
    assert(blockedInclusionAttempt.response.status === 400, "Order lines without cost should not be re-includable");
    assert(blockedInclusionAttempt.payload.code === "ORDER_LINE_COST_REQUIRED", "Missing-cost order lines should expose a stable inclusion error");
    const costedOrderLine = profitableOrder.lines.find((orderLine) => orderLine.material_id === material.id && orderLine.total_cost != null);
    const excludedOrderLine = await request("PATCH", `/api/order-lines/${costedOrderLine.id}/include`, {
      include_in_cost: false
    });
    assert(Number(excludedOrderLine.include_in_cost) === 0, "Order line should be excludable from content cost");
    profitability = await request("GET", "/api/orders/profitability");
    let changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    const changedCostedOrderLine = changedOrder.lines.find((orderLine) => orderLine.id === costedOrderLine.id);
    assert(Number(changedCostedOrderLine.include_in_cost) === 0, "Excluded order line should remain disabled after recomputing profitability");
    await request("PATCH", `/api/order-lines/${costedOrderLine.id}/include`, { include_in_cost: true });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    const restoredCostedOrderLine = changedOrder.lines.find((orderLine) => orderLine.id === costedOrderLine.id);
    assert(Number(restoredCostedOrderLine.include_in_cost) === 1, "Reincluded order line should stay enabled after recomputing profitability");

    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, { include_in_cost: false });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(Math.abs(changedOrder.fixed_set_cost) < 0.0001, "Excluded fixed set component should reduce order fixed set cost");
    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, { include_in_cost: true });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(changedOrder.fixed_set_cost > 0, "Reincluded fixed set component should restore order fixed set cost");

    const noCostFixedMaterial = await request("POST", "/api/materials", {
      name: "Material sin coste para set",
      category: "material",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      notes: "Used to validate set-specific missing cost status"
    });
    const noCostKit = await request("POST", "/api/kit-recipes", {
      name: "Kit con coste pendiente",
      version: "qa",
      is_default: true,
      notes: "Should become the active default set"
    });
    await request("POST", `/api/kit-recipes/${noCostKit.id}/items`, {
      material_id: noCostFixedMaterial.id,
      quantity: 1,
      notes: "No cost component"
    });
    await request("PATCH", `/api/orders/${profitableOrder.id}/fixed-set`, { kit_recipe_id: kitRecipe.id });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(profitability.active_set?.id === noCostKit.id, "Newest default set should become active");
    assert(changedOrder.fixed_set?.id === kitRecipe.id, "Order should preserve its explicitly assigned fixed set");
    assert(changedOrder.status === "complete", "Explicit order set should win over active set when determining missing costs");

    const fixedSetAudit = await request("GET", `/api/audit-log?entity=kit_recipe_item&id=${kitItem.id}`);
    assert(fixedSetAudit.some((row) => row.action === "exclude_from_cost"), "Audit log should include fixed set cost exclusion");
    assert(fixedSetAudit.some((row) => row.action === "include_in_cost"), "Audit log should include fixed set cost inclusion");
    const orderLineAudit = await request("GET", `/api/audit-log?entity=sales_order_line&id=${costedOrderLine.id}`);
    assert(orderLineAudit.some((row) => row.action === "exclude_from_cost"), "Audit log should include order line cost exclusion");
    assert(orderLineAudit.some((row) => row.action === "include_in_cost"), "Audit log should include order line cost inclusion");

    const replenishmentMaterial = await request("POST", "/api/materials", {
      name: "Caja de prueba para reposicion",
      category: "packaging",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      manual_stock: 0,
      reorder_point: 5,
      target_stock: 12,
      tracks_inventory: true,
      purchase_pack_size: 5,
      minimum_order_quantity: 10
    });
    const replenishment = await request("GET", "/api/replenishment/recommendations");
    const replenishmentRow = replenishment.recommendations.find((row) => row.id === replenishmentMaterial.id);
    assert(replenishmentRow, "Replenishment should include inventory-controlled materials");
    assert(replenishmentRow.suggested_quantity === 15, "Replenishment should round fallback target deficit to purchase pack size");
    assert(replenishmentRow.reason.includes("Sin consumo suficiente"), "Every replenishment recommendation should explain its fallback");

    const purchasePlan = await request("POST", "/api/purchase-plans", { material_ids: [replenishmentMaterial.id], name: "Plan QA" });
    assert(purchasePlan.orders.length === 1, "Purchase plan should group selected recommendations by supplier");
    const purchaseOrder = purchasePlan.orders[0];
    const purchaseLine = purchaseOrder.lines[0];
    await request("PATCH", `/api/purchase-orders/${purchaseOrder.id}`, { status: "ordered" });
    const receipt = await request("POST", `/api/purchase-orders/${purchaseOrder.id}/receipts`, {
      lines: [{ purchase_order_line_id: purchaseLine.id, quantity: 5 }]
    });
    assert(receipt.stock_mutated === false, "Purchase receipt must never mutate operational stock");
    assert(receipt.status === "partially_received", "Partial receipt should preserve pending quantities");
    const purchasePlanAfterReceipt = await request("GET", `/api/purchase-plans/${purchasePlan.plan.id}`);
    assert(Number(purchasePlanAfterReceipt.orders[0].lines[0].received_quantity) === 5, "Purchase receipt should preserve traceable received quantity");

    const importForm = new FormData();
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const rejectedImportForm = new FormData();
    rejectedImportForm.append("document", new Blob([Buffer.from("not an invoice")], { type: "text/plain" }), "invoice-test.txt");
    const rejectedImport = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: rejectedImportForm });
    assert(rejectedImport.status === 400, "Unsupported expense document types should be rejected");
    importForm.append("document", new Blob([tinyPng], { type: "image/png" }), "invoice-test.png");
    const importResponse = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: importForm });
    assert(importResponse.status === 202, "Supported expense document should enter the local processing queue");
    const expenseImport = await importResponse.json();
    await request("PATCH", `/api/expense-imports/${expenseImport.id}`, {
      detected_fields: {
        suggested_supplier_id: supplier.id,
        invoice_number: "OCR-QA-001",
        invoice_date: "2026-06-01",
        total: 17.25,
        currency: "EUR"
      }
    });
    const confirmedImport = await request("POST", `/api/expense-imports/${expenseImport.id}/confirm`, {});
    assert(confirmedImport.invoice_id > 0, "Human confirmation should create a draft invoice transactionally");
    const importedInvoice = await request("GET", `/api/invoices/${confirmedImport.invoice_id}`);
    assert(importedInvoice.invoice.status === "draft", "Imported expense must remain draft after confirmation");
    const duplicateImportForm = new FormData();
    duplicateImportForm.append("document", new Blob([tinyPng], { type: "image/png" }), "invoice-duplicate.png");
    const duplicateUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: duplicateImportForm });
    const duplicateImport = await duplicateUpload.json();
    await request("PATCH", `/api/expense-imports/${duplicateImport.id}`, {
      detected_fields: { suggested_supplier_id: supplier.id, invoice_number: "OCR-QA-001", invoice_date: "2026-06-01", total: 17.25 }
    });
    const duplicateConfirm = await requestRaw("POST", `/api/expense-imports/${duplicateImport.id}/confirm`, {});
    assert(duplicateConfirm.response.status === 400 && duplicateConfirm.payload.code === "EXPENSE_IMPORT_DUPLICATE", "Exact supplier and invoice number should block duplicate confirmation");

    const dashboard = await request("GET", "/api/dashboard/finance");
    assert(dashboard.kpis.period_expense > 0, "Dashboard finance should aggregate invoice totals");
    assert(dashboard.kpis.materials_expense > 0, "Dashboard finance should aggregate material spend");
    assert(dashboard.kpis.period_net_received > 0, "Dashboard finance should aggregate payout income");
    assert(Array.isArray(dashboard.income_channels), "Dashboard finance should expose income by channel");
    assert(dashboard.monthly_breakdown.series.cobros.some((value) => value >= 0), "Dashboard finance should expose income monthly series");
    assert(Array.isArray(dashboard.monthly_breakdown.series.balance), "Dashboard finance should expose monthly balance");
    assert(dashboard.income_channels.some((row) => row.channel === "bizum"), "Dashboard finance should expose Bizum channel");
    assert(dashboard.top_suppliers.some((row) => row.supplier_name === "Test Supplier"), "Dashboard should include supplier concentration");
    assert(dashboard.monthly_breakdown.series.materiales.some((value) => value > 0), "Dashboard breakdown should include category spend by month");

    const audit = await request("GET", `/api/audit-log?entity=invoice&id=${invoice.id}`);
    assert(audit.some((row) => row.action === "create"), "Audit log should include invoice creation");
    assert(audit.some((row) => row.action === "archive"), "Audit log should include invoice archive");
    assert(audit.some((row) => row.action === "restore"), "Audit log should include invoice restore");
    const payoutAudit = await request("GET", `/api/audit-log?entity=channel_payout&id=${manualPayout.id}`);
    assert(payoutAudit.some((row) => row.action === "create"), "Audit log should include payout creation");
    assert(payoutAudit.some((row) => row.action === "update"), "Audit log should include payout update");

    if (!process.env.MUA_OPS_SKIP_SYSTEM_TEST_HEALTH) {
      const initialTestHealth = await request("GET", "/api/system/test-health");
      assert(Object.prototype.hasOwnProperty.call(initialTestHealth, "coverage"), "Test health should expose a coverage slot even before running");
      const executedTestHealthRaw = await requestRaw("POST", "/api/system/test-health/run", {});
      assert(executedTestHealthRaw.response.ok, `System test health run should complete successfully: ${JSON.stringify(executedTestHealthRaw.payload)}`);
      const executedTestHealth = executedTestHealthRaw.payload;
      assert(executedTestHealth.status === "ok", `System test health run should finish in ok state: ${JSON.stringify(executedTestHealth)}`);
      assert(Array.isArray(executedTestHealth.suites) && executedTestHealth.suites.some((suite) => suite.id === "coverage"), "System test health should include coverage suite");
      assert(executedTestHealth.coverage && executedTestHealth.coverage.lines.pct > 0, "System test health should persist backend coverage summary");
      const reloadedTestHealth = await request("GET", "/api/system/test-health");
      assert(reloadedTestHealth.coverage && reloadedTestHealth.coverage.functions.pct > 0, "Reloaded system test health should keep coverage data");
      assert(Array.isArray(reloadedTestHealth.history) && reloadedTestHealth.history.length > 0, "System test health should keep execution history");
    }

    await stopTestServer();
    const dbFile = path.join(TEST_DIR, "mua_ops_test.sqlite");
    const backupDir = path.join(TEST_DIR, "backups");
    const backupCountBefore = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;
    const SQL = await initSqlJs({ locateFile: (file) => path.join(ROOT, "node_modules", "sql.js", "dist", file) });
    const db = new SQL.Database(fs.readFileSync(dbFile));
    db.run("DELETE FROM schema_migrations WHERE id='002_mvp_operational_columns'");
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    child = startTestServer();
    await waitForServer();
    const restartedHealth = await request("GET", "/api/system/health");
    assert(restartedHealth.ok === true, "Server should restart cleanly with an existing database");
    assert(restartedHealth.schema.pending_migrations.length === 0, "Migrations should be idempotent after restart");
    const backupCountAfter = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;
    assert(backupCountAfter > backupCountBefore, "Startup should create a backup before applying pending migrations");

    console.log("Mua Ops API test passed");
  } finally {
    await stopTestServer();
    await new Promise((resolve) => mockShopifyServer.close(resolve));
    if (process.env.MUA_OPS_TEST_DEBUG) {
      console.log(serverOutput);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
