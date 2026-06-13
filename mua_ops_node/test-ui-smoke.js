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

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

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
    const importReview = page.locator("[data-open-expense-import]:visible").first();
    if (await importReview.count()) {
      await importReview.click();
      await page.waitForTimeout(350);
      const importViewer = page.locator("#expenseImportDetail .document-viewer");
      if (!(await importViewer.count()) || await importViewer.getAttribute("open") !== null) {
        throw new Error("La validacion OCR no ofrece el visor documental cerrado por defecto");
      }
      await importViewer.locator("summary").click();
      if (await importViewer.getAttribute("open") === null || !(await importViewer.locator(".document-viewer-frame").count())) {
        throw new Error("El visor documental OCR no se despliega correctamente");
      }
      await page.locator("[data-close-expense-import]").click();
    }
    await page.locator('[data-expense-section="registered"]').click();
    const firstInvoice = page.locator("[data-view-invoice]:visible").first();
    if (await firstInvoice.count()) {
      await firstInvoice.click();
      await page.waitForTimeout(500);
      const invoicePanelVisible = await page.locator("#invoiceDetailPanel:not(.hidden)").count();
      if (!invoicePanelVisible) {
        throw new Error("No se abrio el detalle de factura");
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
    if (!(await page.locator("#replenishmentPanel:not(.hidden)").count()) || !(await page.locator(".next-replenishment-row").count())) {
      throw new Error("No cargo la vista de reposicion inteligente");
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
    const ordersFixedPreview = await page.locator("#ordersFixedPreview").count();
    const ordersReview = await page.locator("#ordersReviewQueue").count();
    if (!ordersFilters || !ordersFixedPreview || !ordersReview) {
      throw new Error("No cargo la nueva composicion de pedidos");
    }

    const firstOrder = page.locator("[data-open-order]:visible").first();
    if (await firstOrder.count()) {
      await firstOrder.click();
      await page.waitForTimeout(500);
      const orderPanelVisible = await page.locator("#kitDetailPanel:not(.hidden)").count();
      const orderAudit = await page.locator(".orders-audit-panel").count();
      const orderLines = await page.locator(".orders-material-row").count();
      const orderToggles = await page.locator("[data-order-line-include]").count();
      if (!orderPanelVisible) {
        throw new Error("No se abrio el detalle de pedido");
      }
      if (!orderAudit) {
        throw new Error("No cargo la auditoria de rentabilidad del pedido");
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
      if (!fixedList) {
        throw new Error("No cargo la lista de sets fijos");
      }
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

