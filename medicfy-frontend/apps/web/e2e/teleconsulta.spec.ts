import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Pedido explícito del usuario (2026-10-27): "Iniciar teleconsulta"
// abre un modal (no empuja la página) con la nota clínica real visible
// junto al video, y cerrarlo no debe perder lo escrito. No depende de
// que el proveedor (Daily.co) esté configurado en el entorno de
// pruebas: basta con que el modal se abra y la nota siga editable,
// venga el video o el aviso de "no disponible".

const state = JSON.parse(readFileSync(path.join(__dirname, ".e2e-state.json"), "utf8")) as {
  email: string;
  password: string;
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

test("abrir la teleconsulta en modal deja la nota clínica real visible y editable junto al video", async ({ page }) => {
  await login(page);
  await page.goto(`/consulta/${state.appointmentId}`);
  await expect(page.locator("#chiefComplaint")).toBeVisible({ timeout: 20_000 });

  const marcador = `Nota escrita antes de la llamada ${Date.now()}`;
  await page.locator("#chiefComplaint").fill(marcador);

  await page.getByRole("button", { name: "Iniciar teleconsulta" }).click();

  const dialog = page.getByRole("dialog", { name: "Teleconsulta" });
  await expect(dialog).toBeVisible();
  // La nota real, no un bloc aparte: mismo campo, mismo valor, ahora
  // dentro del modal junto al video.
  await expect(dialog.locator("#chiefComplaint")).toHaveValue(marcador);

  const nuevoTexto = `${marcador} + apunte durante la llamada`;
  await dialog.locator("#chiefComplaint").fill(nuevoTexto);
  await expect(dialog.getByText(/Guardado a las \d/).first()).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(dialog).not.toBeVisible();

  // De vuelta al layout normal, sin perder lo escrito durante la llamada.
  await expect(page.locator("#chiefComplaint")).toHaveValue(nuevoTexto);
});
