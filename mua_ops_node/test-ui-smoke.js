const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");

function canReach(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canReach(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("No arranco el servidor temporal de UI");
}

async function run() {
  const baseUrl = process.env.MUA_OPS_UI_URL || "http://127.0.0.1:5055/";
  const healthUrl = new URL("/api/summary", baseUrl).toString();
  let serverProcess = null;
  if (!(await canReach(healthUrl))) {
    serverProcess = spawn(process.execPath, ["mua_ops_node/server.js", "--port", new URL(baseUrl).port || "5055"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    await waitForServer(healthUrl);
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() !== "error") return;
    if (text.includes("ERR_NETWORK_ACCESS_DENIED")) return;
    errors.push(text);
  });
  const goToDashboard = async () => {
    await page.locator('button.tab[data-view="dashboard"]').evaluate((node) => node.click());
    await page.locator("#dashboard.active").waitFor({ state: "visible" });
  };

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    if ((await page.locator("#dashboardCards .dashboard-kpi-card").count()) !== 5) {
      throw new Error("El Dashboard operativo no muestra los cinco KPIs de decisión");
    }
    const freshnessClass = await page.locator("#dashboardFreshness").getAttribute("class");
    const freshnessText = (await page.locator("#dashboardFreshness").innerText()).trim();
    if (!freshnessText || !/\bis-(fresh|warning|danger|syncing)\b/.test(freshnessClass || "")) {
      throw new Error("El Dashboard no muestra un estado funcional de frescura de sincronizacion");
    }
    const configuredDashboardColors = [
      "dashboard_color_total", "dashboard_color_materiales", "dashboard_color_marketing", "dashboard_color_envios",
      "dashboard_color_servicios", "dashboard_color_software", "dashboard_color_otros", "dashboard_color_balance",
      "dashboard_color_cobros", "dashboard_color_fees", "dashboard_color_shopify", "dashboard_color_etsy", "dashboard_color_bizum",
      "dashboard_color_profit_sales", "dashboard_color_profit_cost", "dashboard_color_profit_margin",
      "dashboard_color_sales_revenue", "dashboard_color_sales_orders", "dashboard_color_sales_ticket", "dashboard_color_sales_previous",
      "dashboard_color_margin_critical", "dashboard_color_margin_pressure", "dashboard_color_margin_healthy",
      "dashboard_color_cost_content", "dashboard_color_cost_fixed"
    ];
    for (const name of configuredDashboardColors) {
      if ((await page.locator(`#settingsForm input[name="${name}"][type="color"]`).count()) !== 1) {
        throw new Error(`Configuración no expone el color ${name}`);
      }
    }
    const marginPanelText = await page.locator(".dashboard-margin-panel").innerText();
    if (!marginPanelText.includes("Crítico") || !marginPanelText.includes("En presión") || !marginPanelText.includes("Saludable")) {
      throw new Error("El Dashboard no traduce los tramos de margen");
    }
    if (await page.locator(".dashboard-driver-head button").filter({ hasText: "->" }).count()) {
      throw new Error("El Dashboard mantiene flechas de texto en sus acciones");
    }
    await page.locator('[data-dashboard-mode="profitability"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator('[data-dashboard-mode="profitability"].is-active').count())
      || !(await page.locator("#dashboardPrimaryTitle").innerText()).includes("rentabilidad")) {
      throw new Error("El Dashboard no cambia correctamente al modo Rentabilidad");
    }
    await page.locator('[data-dashboard-mode="sales"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator('[data-dashboard-mode="sales"].is-active').count())
      || !(await page.locator("#dashboardPrimaryTitle").innerText()).includes("Ventas acumuladas")) {
      throw new Error("El Dashboard no cambia correctamente al modo Ventas");
    }
    await page.locator('[data-dashboard-mode="operation"]').click();
    await page.locator("#dashboardFilterTrigger").click();
    if (await page.locator("#dashboardFilterPopover").evaluate((node) => node.classList.contains("hidden"))) {
      throw new Error("El selector temporal visual del Dashboard no se abre");
    }
    await page.locator('[data-dashboard-period-option="last_30_days"]').click();
    await page.locator('[data-dashboard-granularity-option="day"]').click();
    await page.locator("#dashboardFilterApply").click();
    await page.waitForTimeout(300);
    if (!(await page.locator("#dashboardFilterSummary").innerText()).includes("Diaria")) {
      throw new Error("El selector temporal visual no refleja la granularidad elegida");
    }
    if (await page.locator("#dashboardWindowPreset").inputValue() !== "last_30_days"
      || await page.locator("#dashboardGranularity").inputValue() !== "day") {
      throw new Error("Los filtros temporales del Dashboard no conservan la selección");
    }

    await page.locator('#dashboardOpsList [data-jump-context="replenishment"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#materials.active").count()) || await page.locator("#replenishmentPanel").evaluate((node) => node.classList.contains("hidden"))) {
      throw new Error("Compras urgentes no abre Reposición inteligente");
    }
    await goToDashboard();
    await page.locator('#dashboardOpsList [data-jump-context="draft"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#invoices.active").count()) || await page.locator("#invoiceStatusFilter").inputValue() !== "draft") {
      throw new Error("Gastos por cerrar no abre Gastos filtrados por borrador");
    }
    await goToDashboard();
    await page.locator('#dashboardOpsList [data-jump-context="imports"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#invoices.active").count()) || await page.locator("#expenseImportPanel").evaluate((node) => node.classList.contains("hidden"))) {
      throw new Error("Importaciones por validar no abre la Bandeja de importación");
    }
    await goToDashboard();
    await page.locator('#dashboardOpsList [data-jump-context="low_margin"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#kits.active").count()) || await page.locator("#orderStatusFilter").inputValue() !== "low_margin") {
      throw new Error("Margen en presión no abre Pedidos con el filtro correcto");
    }
    if (!(await page.locator("#orderMetalFilter").count())) {
      throw new Error("Pedidos no expone el filtro por plata/sin plata");
    }
    if (!(await page.locator("#kitList").innerText()).includes("Beneficio real")) {
      throw new Error("Pedidos no muestra el beneficio real en el listado");
    }
    await goToDashboard();
    await page.locator('#dashboardOpsList [data-jump-context="pending"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#income.active").count()) || !(await page.locator('#incomeStatusTabs [data-income-lane="pending"].is-active').count())) {
      throw new Error("Ingresos pendientes no abre el listado pendiente");
    }
    await goToDashboard();

    const refreshRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/orders/profitability") || url.includes("/api/materials") || url.includes("/api/income/summary")) refreshRequests.push(url);
    });
    await page.route("**/api/shopify/sync", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          products: { status: "ok" },
          inventory: { status: "ok" },
          orders: { status: "ok" },
          payouts: { status: "ok" }
        })
      });
    });
    await page.locator('button[data-view="settings"]').click();
    await page.locator('[data-settings-section="shopify"]').click();
    refreshRequests.length = 0;
    await page.locator("[data-sync-shopify-now]").click();
    await page.waitForTimeout(1200);
    if (!refreshRequests.some((url) => url.includes("/api/orders/profitability"))) {
      throw new Error("La sincronizacion Shopify no refresca la lista de pedidos");
    }
    if (!refreshRequests.some((url) => url.includes("/api/materials")) || !refreshRequests.some((url) => url.includes("/api/income/summary"))) {
      throw new Error("La sincronizacion Shopify no refresca todos los dominios afectados");
    }

    await page.locator('button[data-view="invoices"]').click();
    await page.waitForTimeout(350);
    if ((await page.locator("#pageTitle").innerText()) !== "Gastos") {
      throw new Error("El dominio invoice no se presenta visualmente como Gastos");
    }
    await page.locator('[data-expense-section="imports"]').click();
    await page.waitForTimeout(250);
    if (!(await page.locator("#expenseImportPanel:not(.hidden)").count()) || !(await page.locator("#expenseImportUploadForm").count())) {
      throw new Error("No cargo la bandeja supervisada de importacion de gastos");
    }
    if (!(await page.locator("#expenseImportDropzone").count()) || !(await page.locator('#expenseImportUploadForm input[type="file"][multiple]').count())) {
      throw new Error("La bandeja no ofrece una zona moderna de carga multiple");
    }
    if (await page.locator('#expenseImportUploadForm button[type="submit"]').isEnabled()) {
      throw new Error("El boton de importacion debe permanecer deshabilitado sin archivos");
    }
    const importStatusFilter = page.locator('[data-import-filter="status"]');
    if (await importStatusFilter.inputValue() !== "pending_review") {
      throw new Error("La bandeja no aplica el filtro Pendientes por defecto");
    }
    await importStatusFilter.selectOption("");
    if (await importStatusFilter.locator("option:checked").innerText() !== "Todos") {
      throw new Error("El selector de estado no refleja el filtro Todos aplicado");
    }
    await importStatusFilter.selectOption("pending_review");
    if (await page.locator("#expenseImportList .next-import-row.is-confirmed").count()) {
      throw new Error("El filtro Pendientes muestra importaciones confirmadas");
    }
    const importReview = page.locator("[data-open-expense-import]:visible").first();
    if (await importReview.count()) {
      await importReview.click();
      await page.locator("#expenseImportDetail:not(.hidden)").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#invoiceForm.hidden").waitFor({ state: "attached", timeout: 5000 });
      await page.locator("#invoiceDetailPanel.hidden").waitFor({ state: "attached", timeout: 5000 });
      const importViewer = page.locator("#expenseImportDetail .document-viewer");
      if (!(await importViewer.count()) || await importViewer.getAttribute("open") !== null) {
        throw new Error("La validacion OCR no ofrece el visor documental cerrado por defecto");
      }
      await importViewer.locator("summary").click();
      if (await importViewer.getAttribute("open") === null || !(await importViewer.locator(".document-viewer-frame").count())) {
        throw new Error("El visor documental OCR no se despliega correctamente");
      }
      const zoomIn = importViewer.locator('[data-document-zoom="in"]');
      if (!(await zoomIn.count())) throw new Error("El visor documental OCR no ofrece controles de zoom");
      await page.waitForTimeout(250);
      const annotatedViewer = importViewer.locator("[data-annotated-document-viewer]");
      const initialZoom = Number(await annotatedViewer.getAttribute("data-zoom") || 1);
      if ((await importViewer.locator("summary").innerText()).includes("OrderSummary") && initialZoom !== 1.5) {
        throw new Error("El visor de imagen AliExpress no comienza al 150% de zoom");
      }
      await zoomIn.click();
      if (Number(await annotatedViewer.getAttribute("data-zoom") || 1) <= initialZoom) {
        throw new Error("El control de zoom del visor no amplía el documento");
      }
      if ((await importViewer.locator("summary").innerText()).includes("OrderSummary")
        && await annotatedViewer.getAttribute("data-document-kind") === "image"
        && !(await importViewer.locator(".document-evidence-zone").count())) {
        throw new Error("El visor de imagen no resalta las zonas detectadas por OCR");
      }
      if (!(await page.locator('#expenseImportReviewForm input[name="subtotal"]').count())
        || !(await page.locator('#expenseImportReviewForm input[name="discount"]').count())
        || !(await page.locator('#expenseImportReviewForm input[name="shipping"]').count())
        || !(await page.locator('#expenseImportReviewForm input[name="tax"]').count())) {
        throw new Error("La validación OCR no permite revisar los ajustes contables de la factura");
      }
      await page.locator("[data-close-expense-import]").click();
    }
    await page.locator('[data-expense-section="registered"]').click();
    const firstInvoice = page.locator("[data-view-invoice]:visible").first();
    if (await page.locator("[data-view-invoice]").count()) {
      await firstInvoice.waitFor({ state: "visible", timeout: 3000 });
      await firstInvoice.click();
      await page.locator("#invoiceDetailPanel:not(.hidden)").waitFor({ state: "visible", timeout: 5000 });
      const invoicePanelVisible = await page.locator("#invoiceDetailPanel:not(.hidden)").count();
      if (!invoicePanelVisible) {
        throw new Error("No se abrio el detalle de factura");
      }
      await page.locator("#invoiceDetailPanel [data-edit-invoice-details]").click();
      await page.locator("#invoiceForm:not(.hidden)").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#invoiceDetailPanel.hidden").waitFor({ state: "attached", timeout: 5000 });
      if (!(await page.locator("#invoiceForm:not(.hidden)").count()) || await page.locator("#invoiceDetailPanel:not(.hidden)").count()) {
        throw new Error("La edición de factura no sustituye correctamente al detalle");
      }
      await page.locator("#invoiceForm .invoice-form-footer [data-invoice-save-label]").click();
      await page.locator("#invoiceDetailPanel:not(.hidden)").waitFor({ state: "visible", timeout: 2500 });
      if (await page.locator("#invoiceForm:not(.hidden)").count() || !(await page.locator("#invoiceDetailPanel:not(.hidden)").count())) {
        throw new Error("Guardar una factura deja superpuestas las vistas de edición y detalle");
      }
      const invoiceAttachment = page.locator("#invoiceDetailPanel .invoice-document-card .invoice-doc-file");
      if (await invoiceAttachment.count()) {
        const invoiceViewer = page.locator("#invoiceDetailPanel .document-viewer");
        if (!(await invoiceViewer.count()) || await invoiceViewer.getAttribute("open") !== null) {
          throw new Error("El detalle de factura no ofrece el visor documental cerrado por defecto");
        }
      }
    }

    await page.locator('button[data-view="materials"]').click();
    await page.waitForTimeout(350);
    await page.locator('[data-materials-section="replenishment"]').click();
    await page.waitForTimeout(300);
    if (!(await page.locator("#replenishmentPanel:not(.hidden)").count())) {
      throw new Error("No cargo la vista de reposicion inteligente");
    }
    if ((await page.locator("#replenishmentMetrics .replenishment-kpi").count()) !== 4 || (await page.locator("[data-replenishment-action]").count()) !== 4) {
      throw new Error("La reposicion inteligente no muestra sus decisiones y KPIs operativos");
    }
    if (await page.locator("[data-replenishment-select]:checked").count()) {
      throw new Error("La reposicion no debe preseleccionar compras sin supervision humana");
    }
    await page.locator('[data-replenishment-action="review"]').click();
    await page.waitForTimeout(100);
    if (!(await page.locator('[data-replenishment-action="review"].is-active').count()) || !(await page.locator(".next-replenishment-row-v2").count())) {
      throw new Error("El filtro de decisiones de reposicion no responde");
    }
    if (!(await page.locator("#createPurchasePlan").count()) || !(await page.locator("[data-replenishment-quantity]").count())) {
      throw new Error("La reposicion no permite supervisar cantidades antes de crear el plan");
    }
    const expansion = page.locator("[data-toggle-replenishment]");
    if (await expansion.count()) {
      await expansion.first().click();
      if (!(await page.locator(".replenishment-detail").count())) throw new Error("La reposicion no explica el calculo de la cantidad sugerida");
      if ((await page.locator(".replenishment-echart").count()) !== 2) throw new Error("El detalle de reposicion no muestra demanda y proyeccion de stock");
      if (!(await page.locator("[data-replenishment-simulator]").count())) throw new Error("El detalle de reposicion no permite simular otra cantidad");
    }
    await page.locator('[data-materials-section="purchases"]').click();
    await page.waitForTimeout(200);
    if (!(await page.locator("#purchasePlannerPanel:not(.hidden)").count())) {
      throw new Error("No cargo la vista de planes de compra");
    }
    await page.locator('[data-materials-section="catalog"]').click();
    const firstMaterial = page.locator("[data-view-material]:visible").first();
    if (await firstMaterial.count()) {
      await firstMaterial.click();
      await page.waitForTimeout(500);
      const materialTitle = await page.locator("#materialFormTitle").innerText();
      const materialPanelVisible = await page.locator("#materialForm:not(.hidden)").count();
      if (!materialPanelVisible || !materialTitle.trim() || materialTitle.includes("Nuevo material")) {
        throw new Error(`No se abrio el detalle de material (titulo actual: ${materialTitle})`);
      }
    }

    await page.locator('button[data-view="income"]').click();
    await page.waitForTimeout(350);
    const firstPayout = page.locator("[data-open-payout]:visible").first();
    if (await firstPayout.count()) {
      await firstPayout.click();
      await page.waitForTimeout(500);
      const payoutPanelVisible = await page.locator("#payoutDetailPanel:not(.hidden)").count();
      if (!payoutPanelVisible) {
        throw new Error("No se abrio el detalle de ingreso");
      }
    }

    const firstCost = page.locator('[data-open-cost]:visible').first();
    if (await firstCost.count()) {
      await firstCost.click();
      await page.waitForTimeout(600);
      const materialPanelVisible = await page.locator('#materialForm:not(.hidden)').count();
      const materialCostSummary = await page.locator('#materialCostSummary .material-cost-metric').count();
      if (!materialPanelVisible || !materialCostSummary) {
        throw new Error('No se abrio el detalle de coste dentro de materiales');
      }
    }

    await page.locator('button[data-view="kits"]').click();
    await page.waitForTimeout(800);
    const ordersFilters = await page.locator(".orders-filter-panel").count();
    const orderTypeFilter = await page.locator("#orderTypeFilter").count();
    const orderSetFilter = await page.locator("#orderSetFilter").count();
    const ordersFixedPreview = await page.locator("#ordersFixedPreview").count();
    const ordersReview = await page.locator("#ordersReviewQueue").count();
    if (!ordersFilters || !orderTypeFilter || !orderSetFilter || !ordersFixedPreview || !ordersReview) {
      throw new Error("No cargo la nueva composicion de pedidos");
    }
    const firstOrder = page.locator("[data-open-order]:visible").first();
    if (await firstOrder.count()) {
      const orderTypeBadges = await page.locator(".order-type-badge").count();
      if (!orderTypeBadges) throw new Error("El listado de pedidos no muestra la tipologia");
      await firstOrder.click();
      await page.waitForTimeout(500);
      const orderPanelVisible = await page.locator("#kitDetailPanel:not(.hidden)").count();
      const orderAudit = await page.locator(".orders-audit-panel").count();
      const orderIdentity = await page.locator(".order-identity-band").count();
      const orderTypeEditor = await page.locator(".order-type-editor").count();
      const orderLines = await page.locator(".orders-material-row").count();
      const orderToggles = await page.locator("[data-order-line-include]").count();
      if (!orderPanelVisible) {
        throw new Error("No se abrio el detalle de pedido");
      }
      if (!orderAudit) {
        throw new Error("No cargo la auditoria de rentabilidad del pedido");
      }
      if (!orderIdentity || !orderTypeEditor) {
        throw new Error("El detalle no explica la tipologia ni el set recomendado");
      }
      if (!orderLines || !orderToggles) {
        throw new Error("No cargo el desglose de materiales con interruptores de coste");
      }
      const disabledCheckedToggles = await page.locator('[data-order-line-include][disabled]:checked').count();
      if (disabledCheckedToggles) {
        throw new Error("Hay lineas sin coste bloqueadas pero visualmente siguen marcadas como incluidas");
      }
    }

    const fixedTab = page.locator('[data-orders-section="fixed"]:visible').first();
    if (await fixedTab.count()) {
      await fixedTab.click();
      await page.waitForTimeout(500);
      const fixedList = await page.locator("#ordersFixedList").count();
      const fixedRows = await page.locator(".orders-fixed-row").count();
      const fixedToggles = await page.locator("[data-kit-item-include]").count();
      const typeSelector = await page.locator(".orders-type-selector").count();
      if (!fixedList) {
        throw new Error("No cargo la lista de sets fijos");
      }
      if (!typeSelector) throw new Error("Los sets no estan organizados por tipologia");
      if (fixedRows && !fixedToggles) {
        throw new Error("Los componentes del set fijo no muestran interruptor de coste");
      }
    }

    await page.locator('button[data-view="audit"]').click();
    await page.waitForTimeout(800);
    const auditSummary = await page.locator("#auditSummary").count();
    const auditKpis = await page.locator(".audit-kpi").count();
    const auditRows = await page.locator(".audit-row-actions [data-open-audit-detail]").count();
    if (!auditSummary || !auditKpis) {
      throw new Error("No cargo la vista de actividad");
    }
    if (auditRows) {
      await page.locator(".audit-row-actions [data-open-audit-detail]:visible").first().click();
      await page.waitForTimeout(500);
      const auditDetail = await page.locator("#auditDetailPanel:not(.hidden)").count();
      const auditDiff = await page.locator(".audit-diff-panel").count();
      if (!auditDetail || !auditDiff) {
        throw new Error("No se abrio el detalle de actividad");
      }
      await page.locator("[data-close-audit-detail]:visible").click();
      await page.waitForTimeout(300);
      if (!(await page.locator("#auditDetailPanel.hidden").count())) {
        throw new Error("No se cerro el detalle de actividad");
      }
    }

    await page.locator('button[data-view="settings"]').click();
    await page.waitForTimeout(500);

    const pageTitle = await page.locator("#pageTitle").innerText();
    const settingsStatusItems = await page.locator("#settingsStatusStrip .settings-status-item").count();
    if (settingsStatusItems < 4) {
      throw new Error(`El resumen de Configuracion no muestra suficientes estados (actual: ${settingsStatusItems})`);
    }

    const settingsSections = [
      ["general", ".settings-section-head", ".settings-context-card"],
      ["dashboard", ".settings-color-grid", ".settings-context-card"],
      ["cobros", '[name="default_payout_channel"]', ".settings-context-card"],
      ["shopify", "#shopifyConnectionForm", ".settings-context-card"],
      ["diagnostico", "#systemHealthCards", ".settings-context-card"],
      ["logs", "#technicalLogList", ".settings-context-card"],
    ];
    for (const [section, contentSelector, contextSelector] of settingsSections) {
      await page.locator(`[data-settings-section="${section}"]`).click();
      await page.waitForTimeout(250);
      const visiblePanel = page.locator(`[data-settings-panel="${section}"]:not(.hidden)`);
      if (!(await visiblePanel.count())) {
        throw new Error(`No se mostro la seccion de Configuracion: ${section}`);
      }
      if (!(await visiblePanel.locator(contentSelector).count())) {
        throw new Error(`La seccion ${section} no cargo su contenido principal`);
      }
      if (!(await page.locator(`#settingsContextAside ${contextSelector}`).count())) {
        throw new Error(`La seccion ${section} no cargo su contexto lateral`);
      }
      if (section === "shopify") {
        const connection = await page.evaluate(() => fetch("/api/shopify/connection").then((response) => response.json()));
        const domain = await visiblePanel.locator('[name="store_domain"]').inputValue();
        if (!domain || domain !== connection.store_domain) {
          throw new Error(`El dominio Shopify no se cargo en el formulario (actual: ${domain || "vacio"})`);
        }
        for (const name of ["pull_products", "pull_inventory", "pull_orders", "pull_payouts"]) {
          const checked = await visiblePanel.locator(`[name="${name}"]`).isChecked();
          if (checked !== Boolean(connection[name])) {
            throw new Error(`El alcance Shopify ${name} no refleja el valor persistido`);
          }
        }
      }
    }

    if (pageTitle.normalize("NFD").replace(/\p{Diacritic}/gu, "") !== "Configuracion") {
      throw new Error(`La vista final no es Configuracion (actual: ${pageTitle})`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[data-view="invoices"]').click();
    await page.locator('[data-expense-section="imports"]').click();
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (mobileOverflow > 0) {
      throw new Error(`La bandeja de importacion desborda en movil (${mobileOverflow}px)`);
    }
    if (errors.length) {
      throw new Error(`Se detectaron errores de frontend: ${errors.join(" | ")}`);
    }

    console.log("Mua Ops UI smoke test passed");
  } finally {
    await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

