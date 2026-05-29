import { expect, test } from "@playwright/test";

async function capture(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `tests/ui/artifacts/${name}.png`, fullPage: true });
}

test("carga el dashboard nuevo y navega por dominios clave", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("h1")).toHaveText("Dashboard");
  await expect(page.getByText("Preview del refresh frontend")).toBeVisible();
  await expect(page.getByText("Gasto total")).toBeVisible({ timeout: 15000 });
  await capture(page, "dashboard");

  await page.getByRole("button", { name: "Gastos" }).click();
  await expect(page.locator("h1")).toHaveText("Gastos");
  await expect(page.getByText(/facturas visibles en la preview/i)).toBeVisible({ timeout: 15000 });
  await capture(page, "gastos");

  await page.getByRole("button", { name: "Ingresos" }).click();
  await expect(page.locator("h1")).toHaveText("Ingresos");
  await expect(page.getByText(/movimientos visibles en la preview/i)).toBeVisible({ timeout: 15000 });
  await capture(page, "ingresos");
});

test("muestra navegación jerárquica y configuración técnica", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Operaciones" }).click();
  await expect(page.getByRole("button", { name: "Materiales" })).toBeVisible();
  await page.getByRole("button", { name: "Materiales" }).click();
  await expect(page.locator("h1")).toHaveText("Materiales");
  await expect(page.getByText(/materiales activos en la preview/i)).toBeVisible({ timeout: 15000 });
  await capture(page, "materiales");

  await page.getByRole("button", { name: "Sistema" }).click();
  await page.getByRole("button", { name: "Diagnóstico" }).click();
  await expect(page.locator("h1")).toHaveText("Diagnóstico");
  await expect(page.getByText("Salud del sistema")).toBeVisible({ timeout: 15000 });
  await capture(page, "diagnostico");
});
