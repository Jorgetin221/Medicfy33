import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Pruebas 17.1, 17.2 y 17.4 de la Fase 1 (texto literal del documento
// de 58 prompts). La 17.3 (alergia sin scroll) vive en doc06-tableta y
// la 17.5 (otro médico → error de autorización) en la suite de
// integración del backend (m5a).

const state = JSON.parse(readFileSync(path.join(__dirname, ".e2e-state.json"), "utf8")) as {
  email: string;
  password: string;
  patientId: string;
  appointmentId: string;
};

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").focus();
  await page.keyboard.type(state.email);
  await page.locator("#password").focus();
  await page.keyboard.type(state.password);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/agenda");
}

test("17.1 — desde la agenda del día, dos clics bastan para estar escribiendo en la nota del paciente correcto", async ({ page }) => {
  await login(page);

  // Clic 1: el renglón del paciente en la agenda.
  const startButton = page.getByRole("button", { name: /^Iniciar$|Continuar consulta/ }).first();
  await expect(startButton).toBeVisible({ timeout: 15_000 });
  await startButton.click();

  await page.waitForURL(`**/consulta/${state.appointmentId}`);
  await expect(page.locator("#chiefComplaint")).toBeVisible({ timeout: 20_000 });
  // El paciente correcto está en contexto (Zona 1).
  await expect(page.getByRole("complementary").first().getByText("María TabletaPrueba")).toBeVisible();

  // Clic 2: el campo de la nota — y ya se escribe.
  await page.locator("#chiefComplaint").click();
  await page.keyboard.type("Dos clics y escribiendo");
  await expect(page.locator("#chiefComplaint")).toHaveValue("Dos clics y escribiendo");
});

test("17.2 — recargar a media captura recupera el borrador íntegro, incluido el punto de scroll", async ({ page }) => {
  await login(page);
  await page.goto(`/consulta/${state.appointmentId}`);
  await expect(page.locator("#plan")).toBeVisible({ timeout: 20_000 });

  const marcador = `Borrador que debe sobrevivir la recarga ${Date.now()}`;
  await page.locator("#plan").click();
  await page.locator("#plan").fill(marcador);

  // Rebote de 2s (prompt 15): esperar el "Guardado a las HH:MM".
  await expect(page.getByText(/Guardado a las \d/).first()).toBeVisible({ timeout: 15_000 });

  // Scroll a media página y dejar que el rebote de 500ms lo persista.
  await page.evaluate(() => window.scrollTo(0, 350));
  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.locator("#plan")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#plan")).toHaveValue(marcador);
  await expect
    .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5_000 })
    .toBeGreaterThan(200);
});

test.describe("17.4 — tableta angosta: el panel lateral (Zona 3) se abre y cierra con el dedo", () => {
  test.use({ viewport: { width: 900, height: 700 }, hasTouch: true });

  test("cajón deslizable con objetivos táctiles de 44px", async ({ page }) => {
    await login(page);
    await page.goto(`/consulta/paciente/${state.patientId}`);
    await expect(page.locator("#chiefComplaint")).toBeVisible({ timeout: 20_000 });

    const toggle = page.getByTestId("zona3-drawer-toggle");
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43);

    // Con el dedo (tap táctil), no con click de ratón.
    await toggle.tap();
    const drawer = page.getByRole("dialog", { name: "Panel de consulta (cajón)" });
    await expect(drawer.getByTestId("zona3-panel")).toBeVisible();
    await drawer.getByRole("tab", { name: "Historia" }).tap();
    await expect(drawer.getByText("La historia clínica estructurada llega con la Fase 2.")).toBeVisible();

    await drawer.getByRole("button", { name: "Cerrar ✕" }).tap();
    await expect(page.getByRole("dialog", { name: "Panel de consulta (cajón)" })).not.toBeVisible();

    // Y la captura no se interrumpió: el campo sigue ahí, editable.
    await page.locator("#chiefComplaint").tap();
    await page.keyboard.type("La Zona 3 no interrumpe");
    await expect(page.locator("#chiefComplaint")).toHaveValue(/La Zona 3 no interrumpe/);
  });
});
