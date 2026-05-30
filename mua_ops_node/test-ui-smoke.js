const { chromium } = require("playwright");

async function run() {
  const baseUrl = process.env.MUA_OPS_UI_URL || "http://127.0.0.1:5055/";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

    await page.locator('button[data-view="invoices"]').click();
    await page.waitForTimeout(350);
    await page.locator('button[data-view="income"]').click();
    await page.waitForTimeout(350);
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
