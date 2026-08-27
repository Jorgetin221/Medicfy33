import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// CLAUDE.md §6, primer requisito duro de DOC-06: "una consulta de
// seguimiento completa SIN TOCAR EL RATÓN". Esta prueba lo ejecuta al
// pie de la letra: desde que la pantalla de consulta carga hasta que
// la nota queda firmada, no hay UN SOLO click de mouse — solo foco de
// teclado, escritura, ↑/↓/Enter en el buscador CIE-10 y Ctrl+Enter
// para firmar (la confirmación nativa se acepta como diálogo).

const state = JSON.parse(readFileSync(path.join(__dirname, ".e2e-state.json"), "utf8")) as {
  email: string;
  password: string;
  patientId: string;
};

async function loginByKeyboard(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").focus();
  await page.keyboard.type(state.email);
  // Foco directo (no Tab): entre correo y contraseña puede haber otros
  // elementos enfocables; el criterio sin-ratón aplica a la CONSULTA.
  await page.locator("#password").focus();
  await page.keyboard.type(state.password);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/agenda");
}

async function typeInto(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).focus();
  await page.keyboard.type(text);
}

test("consulta de seguimiento completa sin tocar el ratón: nota + diagnóstico por teclado + Ctrl+Enter firma", async ({ page }) => {
  await loginByKeyboard(page);
  await page.goto(`/consulta/paciente/${state.patientId}`);

  // Pantalla hidratada: el formulario de la nota está listo.
  await expect(page.locator("#chiefComplaint")).toBeVisible({ timeout: 20_000 });
  // Es una paciente con consultas firmadas previas → modo seguimiento,
  // con su objetivo de tiempo visible (CLAUDE.md §6: dos modos).
  await expect(page.getByText("objetivo 3–4 min")).toBeVisible();

  // ── La nota, solo con teclado ────────────────────────────────────
  await typeInto(page, "#chiefComplaint", "Control de diabetes y prenatal");
  await typeInto(page, "#currentIllness", "Acude a control programado, sin datos de alarma, buen apego al tratamiento.");
  await typeInto(page, "#assessment", "Evolución estable, glucemias en meta.");
  await typeInto(page, "#plan", "Continuar metformina, control en 4 semanas con laboratorios previos.");

  // ── El diagnóstico, con ↑/↓/Enter en el combobox CIE-10 ─────────
  const search = page.getByRole("combobox", { name: "Buscar diagnóstico CIE-10" });
  await search.focus();
  await page.keyboard.type("diabetes");
  const listbox = page.locator("#icd10-results");
  await expect(listbox.getByRole("option").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  // El diagnóstico quedó agregado como PRINCIPAL.
  await expect(page.getByText("PRINCIPAL").first()).toBeVisible();

  // ── Firma: Ctrl+Enter + confirmación nativa (Enter del diálogo) ──
  page.once("dialog", (dialog) => void dialog.accept());
  await page.keyboard.press("ControlOrMeta+Enter");

  // Al firmar, la pantalla redirige al expediente de la paciente con
  // la confirmación visible — ese es el fin del flujo sin ratón.
  await page.waitForURL(`**/pacientes/${state.patientId}?justSigned=1`, { timeout: 20_000 });
  await expect(page.getByText("Consulta firmada correctamente.")).toBeVisible();
});
