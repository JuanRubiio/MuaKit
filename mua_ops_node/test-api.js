const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(__dirname, "server.js");
const TEST_DIR = path.join(ROOT, "data", "mua_ops_test");
const PORT = 5065;
const SHOPIFY_MOCK_PORT = 5066;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanTestDir() {
  const resolved = path.resolve(TEST_DIR);
  assert(resolved.startsWith(path.join(ROOT, "data")), "Test directory must stay inside data/");
  fs.rmSync(resolved, { recursive: true, force: true });
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
                totalTaxSet: { shopMoney: { amount: "10.00", currencyCode: "EUR" } }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    } else if (query.includes("query ShopifyPayouts")) {
      data = {
        shopifyPaymentsAccount: {
          payouts: {
            edges: [
              {
                cursor: "payout-1",
                node: {
                  id: "gid://shopify/ShopifyPaymentsPayout/1",
                  issuedAt: "2026-05-15T00:00:00Z",
                  status: "PAID",
                  gross: { amount: "452.36", currencyCode: "EUR" },
                  fees: { amount: "11.30", currencyCode: "EUR" },
                  net: { amount: "441.06", currencyCode: "EUR" }
                }
              }
            ],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
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

async function request(method, route, body) {
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
  const child = spawn(process.execPath, [SERVER, "--port", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      MUA_OPS_DATA_DIR: TEST_DIR,
      MUA_OPS_DB_FILE: path.join(TEST_DIR, "mua_ops_test.sqlite"),
      MUA_OPS_LEGACY_JSON: path.join(TEST_DIR, "empty.json")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

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

    const connectionTest = await request("POST", "/api/shopify/connection/test", {});
    assert(connectionTest.ok === true, "Shopify connection test should succeed against mock server");

    const firstShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(firstShopifySync.products?.rows > 0, "Shopify sync should import products");
    assert(firstShopifySync.inventory?.rows > 0, "Shopify sync should import inventory");
    assert(firstShopifySync.orders?.rows > 0, "Shopify sync should import orders");
    assert(firstShopifySync.payouts?.rows > 0, "Shopify sync should import payouts");

    const secondShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(secondShopifySync.products?.created === 0, "Shopify product sync should be idempotent on second run");

    const shopifySyncStatus = await request("GET", "/api/shopify/sync-status");
    assert(shopifySyncStatus.last_sync_status === "ok", "Shopify sync status should record successful syncs");
    assert(shopifySyncStatus.last_products_sync_at, "Shopify sync status should retain per-block timestamps");

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
    assert(payouts.some((row) => row.external_id === "gid://shopify/ShopifyPaymentsPayout/1"), "Shopify direct sync should persist API payouts");

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
    assert(materialCost.purchase_lots === 0, "Archived invoice should stop affecting costs");

    const restoredInvoice = await request("POST", `/api/invoices/${invoice.id}/restore`);
    assert(restoredInvoice.is_deleted === 0, "Invoice should be restored");
    costs = await request("GET", "/api/costs/materials");
    materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 2, "Restored invoice should affect costs again");

    const dashboard = await request("GET", "/api/dashboard/finance");
    assert(dashboard.kpis.total_expense > 0, "Dashboard finance should aggregate invoice totals");
    assert(dashboard.kpis.materials_expense > 0, "Dashboard finance should aggregate material spend");
    assert(dashboard.kpis.total_net_received > 0, "Dashboard finance should aggregate payout income");
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

    console.log("Mua Ops API test passed");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
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
