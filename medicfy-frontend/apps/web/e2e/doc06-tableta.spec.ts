import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// CLAUDE.md §6 / R8 — el criterio duro de DOC-06, ahora MEDIBLE:
// en 1280×800, antecedentes, alergias y últimas 3 consultas (y desde
// la Fase 1: diagnósticos vigentes y embarazo) visibles SIN scroll ni
// clic, y objetivos táctiles de 44px. Si la Zona 1 se sale del
// viewport, esta prueba falla — es la métrica, no una opinión.

const state = JSON.parse(readFileSync(path.join(__dirname, ".e2e-state.json"), "utf8")) as {
  email: string;
  password: string;
  patientId: string;
};

const VIEWPORT_HEIGHT = 800;

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", state.email);
  await page.fill("#password", state.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/agenda");
}

async function expectFullyInViewport(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} debe existir`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} debe tener caja`).not.toBeNull();
  expect(box!.y, `${label} empieza dentro del viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label} termina dentro de los ${VIEWPORT_HEIGHT}px — sin scroll`).toBeLessThanOrEqual(
    VIEWPORT_HEIGHT
  );
}

test("Zona 1 completa visible sin scroll ni clic en 1280×800", async ({ page }) => {
  await login(page);
  await page.goto(`/consulta/paciente/${state.patientId}`);

  // La Zona 1 terminó de cargar cuando aparece el banner de embarazo.
  await expect(page.getByTestId("pregnancy-banner")).toBeVisible({ timeout: 20_000 });

  // Nada movió el scroll de la página al cargar.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Zona 1 = la columna de contexto (<aside> — rol "complementary");
  // los localizadores van escopados a ella porque el formulario de la
  // nota también habla de antecedentes y alergias.
  const zona1 = page.getByRole("complementary");
  await expectFullyInViewport(zona1.getByText("María TabletaPrueba"), "nombre de la paciente");
  await expectFullyInViewport(zona1.getByTestId("pregnancy-banner"), "banner de embarazo (#18)");
  await expectFullyInViewport(zona1.getByRole("heading", { name: "Diagnósticos vigentes" }), "encabezado de diagnósticos vigentes (#19)");
  await expectFullyInViewport(zona1.getByText("Diabetes mellitus tipo 2").first(), "primer diagnóstico vigente");
  await expectFullyInViewport(zona1.getByRole("heading", { name: "Antecedentes" }), "encabezado de antecedentes");
  await expectFullyInViewport(zona1.locator('[aria-label="Alergias activas"]'), "bloque de alergias (primero en prominencia, prompt 13)");
  await expectFullyInViewport(zona1.getByText("Penicilinas").first(), "la alergia GRAVE — el dato que salva de un evento adverso");
  await expectFullyInViewport(zona1.getByRole("heading", { name: "Últimas consultas" }), "encabezado de últimas consultas");

  // Las 3 consultas firmadas listadas, la más antigua también dentro.
  const encounterItems = page.locator("aside li", { hasText: /Primera vez|Seguimiento/ });
  await expect(encounterItems).toHaveCount(3);
  await expectFullyInViewport(encounterItems.nth(2), "tercera consulta previa");
});

test("R8: los botones del Escritorio miden al menos 44px de alto", async ({ page }) => {
  await login(page);
  await page.goto(`/consulta/paciente/${state.patientId}`);
  await expect(page.getByTestId("pregnancy-banner")).toBeVisible({ timeout: 20_000 });

  const buttons = page.locator("main button:visible");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    const label = (await buttons.nth(i).innerText().catch(() => "")).slice(0, 40) || `botón #${i}`;
    // 43 y no 44: el redondeo sub-pixel de los navegadores reporta
    // 43.99 en cajas que el CSS declara de 44 (min-h-11).
    expect(box.height, `objetivo táctil de "${label}"`).toBeGreaterThanOrEqual(43);
  }
});
