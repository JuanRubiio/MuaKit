const { chromium } = require("playwright");

async function run() {
  const baseUrl = process.env.MUA_OPS_UI_URL || "http://127.0.0.1:5055/";
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
    const firstInvoice = page.locator('[data-view-invoice]').first();
    if (await firstInvoice.count()) {
      await firstInvoice.click();
      await page.waitForTimeout(500);
      const invoicePanelVisible = await page.locator("#invoiceDetailPanel:not(.hidden)").count();
      if (!invoicePanelVisible) {
        throw new Error("No se abrió el detalle de factura en la UI clásica");
      }
    }

    await page.locator('button[data-view="materials"]').click();
    await page.waitForTimeout(350);
    const firstMaterial = page.locator('[data-view-material]').first();
    if (await firstMaterial.count()) {
      await firstMaterial.click();
      await page.waitForTimeout(500);
      const materialTitle = await page.locator("#materialFormTitle").innerText();
      if (!materialTitle.includes("Editar material")) {
        throw new Error(`No se abrió el detalle de material (título actual: ${materialTitle})`);
      }
    }

    await page.locator('button[data-view="income"]').click();
    await page.waitForTimeout(350);
    const firstPayout = page.locator('[data-open-payout]').first();
    if (await firstPayout.count()) {
      await firstPayout.click();
      await page.waitForTimeout(500);
      const payoutPanelVisible = await page.locator("#payoutDetailPanel:not(.hidden)").count();
      if (!payoutPanelVisible) {
        throw new Error("No se abrió el detalle de ingreso en la UI clásica");
      }
    }

    await page.locator('button[data-view="costs"]').click();
    await page.waitForTimeout(350);
    const firstCost = page.locator('[data-open-cost]').first();
    if (await firstCost.count()) {
      await firstCost.click();
      await page.waitForTimeout(500);
      const costPanelVisible = await page.locator("#costDetailPanel:not(.hidden)").count();
      if (!costPanelVisible) {
        throw new Error("No se abrió el detalle de coste en la UI clásica");
      }
    }

    await page.locator('button[data-view="kits"]').click();
    await page.waitForTimeout(350);
    const firstKit = page.locator('[data-open-kit]').first();
    if (await firstKit.count()) {
      await firstKit.click();
      await page.waitForTimeout(500);
      const kitPanelVisible = await page.locator("#kitDetailPanel:not(.hidden)").count();
      if (!kitPanelVisible) {
        throw new Error("No se abrió el detalle de kit en la UI clásica");
      }
    }

    await page.locator('button[data-view="audit"]').click();
    await page.waitForTimeout(500);
    const auditSummary = await page.locator("#auditSummary").count();
    if (!auditSummary) {
      throw new Error("No cargó la vista de actividad en la UI clásica");
    }

    await page.locator('button[data-view="settings"]').click();
    await page.waitForTimeout(500);

    const pageTitle = await page.locator("#pageTitle").innerText();
    const hasSystemHealth = await page.locator("#systemHealthCards").count();

    if (pageTitle !== "Configuración") {
      throw new Error(`La vista final no es Configuración (actual: ${pageTitle})`);
    }
    if (!hasSystemHealth) {
      throw new Error("No se encontró el bloque de diagnóstico técnico");
    }
    if (errors.length) {
      throw new Error(`Se detectaron errores de frontend: ${errors.join(" | ")}`);
    }

    console.log("Mua Ops UI smoke test passed");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
