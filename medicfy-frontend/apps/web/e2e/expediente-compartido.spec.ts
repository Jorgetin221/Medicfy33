import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// PR-EXP-07 — E2E completo del expediente compartido, contra la pila
// COMPLETA (API real en :3001 con Postgres, web en :3000), proyecto
// "tableta" 1280×800 (R8). El paciente no tiene cuenta: su enlace y
// su OTP se leen del buzón de desarrollo donde el adaptador de consola
// los deposita (ConsoleRecordShareNotificationAdapter → DEV_OUTBOX_PATH)
// — nunca del log de la aplicación (batería B15).
//
// Pasos (letra del prompt maestro):
// 1. A atiende y firma la consulta de P con F32 y una alergia.
// 2. B (verificado) solicita el resumen.
// 3. P autoriza con OTP sin incluir salud mental.
// 4. B ve la alergia en primer lugar y NO ve F32 ni ningún rastro.
// 5. A ve el acceso en la pestaña "Compartido".
// 6. P revoca.
// 7. B recibe 403.

const API = process.env.E2E_API_URL ?? "http://localhost:3001";
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://jorgetinoco@localhost:5432/medicfy_mvp_dev";
const OUTBOX = process.env.E2E_DEV_OUTBOX_PATH ?? path.join(tmpdir(), "medicfy-dev-outbox.log");
const PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

interface Doctor {
  email: string;
  userId: string;
  token: string;
  displayName: string;
}

async function api<T>(pathname: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// Mismo único paso fuera de la API que global-setup.ts: la
// verificación del médico (cola de admin en el producto).
async function createVerifiedDoctor(firstName: string): Promise<Doctor> {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e.exp.${firstName.toLowerCase()}.${suffix}@example.com`;
  const registered = await api<{ userId: string }>("/auth/register/doctor", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      legalFirstName: firstName,
      legalLastName: `Compartido${suffix}`,
      professionalLicense: String(Math.floor(10000000 + Math.random() * 89999999)),
      primarySpecialtyCode: "GENERAL",
      phone: `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`,
    }),
  });
  execFileSync("psql", [
    DB,
    "-q",
    "-c",
    `UPDATE doctors SET "verificationStatus" = 'VERIFIED' WHERE "userId" = '${registered.userId}'; UPDATE users SET status = 'ACTIVE', "emailVerifiedAt" = now(), "loginsWithoutMfa" = -1000000 WHERE id = '${registered.userId}';`,
  ]);
  const login = await api<{ accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
  return { email, userId: registered.userId, token: login.accessToken, displayName: `${firstName} Compartido${suffix}` };
}

async function login(page: Page, doctor: Doctor): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", doctor.email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/agenda");
}

async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
}

// El buzón es un archivo que solo crece; se lee el ÚLTIMO bloque del
// tipo pedido dirigido a este paciente.
async function readOutbox(kind: string, destination: string, field: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(OUTBOX)) {
      const blocks = readFileSync(OUTBOX, "utf8").split(/^--- /m).filter((b) => b.includes(`· ${kind}`) && b.includes(`para: ${destination}`));
      const value = blocks.at(-1)?.match(new RegExp(`^${field}: (\\S+)$`, "m"))?.[1];
      if (value) return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Buzón de desarrollo sin "${kind}" para el paciente — ¿la API corre con el adaptador de consola en esta máquina? (${OUTBOX})`);
}

test("expediente compartido: solicitud → autorización sin salud mental → visor sin F32 → custodio → revocación → 403", async ({ page }) => {
  test.setTimeout(180_000);
  const doctorA = await createVerifiedDoctor("Custodia");
  const doctorB = await createVerifiedDoctor("Receptor");
  const suffix = randomUUID().slice(0, 6);
  const patient = {
    firstName: `Paciente${suffix.replace(/\d/g, "x")}`,
    lastNamePaternal: "ExpedienteE2E",
    birthDate: "1991-04-12",
    email: `e2e.exp.paciente.${suffix}@example.com`,
  };

  // 1 — A atiende y firma (por la API, como global-setup.ts): F32 + alergia.
  const created = await api<{ id: string }>("/patients", {
    method: "POST",
    token: doctorA.token,
    body: JSON.stringify({ ...patient, sexAtBirth: "F", phoneE164: `+52${Math.floor(1000000000 + Math.random() * 8999999999)}` }),
  });
  await api(`/records/patients/${created.id}/allergies`, {
    method: "POST",
    token: doctorA.token,
    body: JSON.stringify({ agentKey: "penicilinas", allergyType: "MEDICAMENTO", severity: "GRAVE", certainty: "CONFIRMED", source: "PACIENTE", reaction: "Anafilaxia" }),
  });
  const encounter = await api<{ id: string }>(`/records/patients/${created.id}/encounters`, {
    method: "POST",
    token: doctorA.token,
    body: JSON.stringify({ patientId: created.id, encounterType: "FIRST_VISIT" }),
  });
  await api(`/records/encounters/${encounter.id}/sign`, {
    method: "POST",
    token: doctorA.token,
    body: JSON.stringify({
      chiefComplaint: "Tristeza persistente",
      currentIllness: "Ánimo bajo de varias semanas.",
      vitals: {},
      assessment: "Episodio depresivo moderado.",
      plan: "Seguimiento en 2 semanas.",
      diagnoses: [{ icd10Code: "F32.1", description: "Episodio depresivo moderado", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
    }),
  });

  // 2 — B solicita el resumen desde la UI.
  await login(page, doctorB);
  await page.goto("/expediente-compartido/solicitar");
  await page.fill("#patient\\.firstName", patient.firstName);
  await page.fill("#patient\\.lastNamePaternal", patient.lastNamePaternal);
  await page.locator("#patient\\.birthDate").pressSequentially("12041991");
  await page.fill("#patient\\.email", patient.email);
  await page.fill("#reason", "Valoración por cardiología antes de iniciar tratamiento");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText("Solicitud enviada")).toBeVisible();
  await logout(page);

  // 3 — P autoriza con OTP, sin tocar las casillas sensibles (excluidas por defecto).
  const authorizationUrl = await readOutbox("solicitud de autorización", patient.email, "autorizar");
  await page.goto(new URL(authorizationUrl).pathname);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  const otp = await readOutbox("código de verificación", patient.email, "código");
  await page.getByLabel("Código de 6 dígitos").fill(otp);
  await page.getByRole("button", { name: "Validar código" }).click();
  await expect(page.getByLabel("Salud mental")).not.toBeChecked();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Autorización enviada")).toBeVisible();

  // 4 — B ve la alergia en primer lugar y nada de F32.
  await login(page, doctorB);
  await page.goto("/expediente-compartido/compartidos-conmigo");
  await page.getByRole("link", { name: "Ver expediente" }).first().click();
  await expect(page.getByText("Penicilinas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Alergias");
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(/F32|depresivo|Tristeza/i);
  const grantId = page.url().split("/").at(-1) ?? "";
  await logout(page);

  // 5 — A ve el acceso en la pestaña "Compartido".
  await login(page, doctorA);
  await page.goto(`/pacientes/${created.id}`);
  await page.getByRole("tab", { name: "Compartido" }).click();
  await expect(page.getByText(doctorB.displayName)).toBeVisible();
  await expect(page.getByText("Vigente")).toBeVisible();
  await logout(page);

  // 6 — P revoca con el enlace de su confirmación.
  const revocationUrl = await readOutbox("confirmación de autorización", patient.email, "revocar");
  await page.goto(new URL(revocationUrl).pathname);
  await page.getByRole("button", { name: "Enviarme un código para confirmar" }).click();
  // El OTP de revocación es un challenge distinto: se espera a uno
  // diferente del de autorización.
  await expect.poll(() => readOutbox("código de verificación", patient.email, "código")).not.toBe(otp);
  const revokeOtp = await readOutbox("código de verificación", patient.email, "código");
  await page.getByLabel("Código de 6 dígitos").fill(revokeOtp);
  await page.getByRole("button", { name: "Validar código" }).click();
  await page.getByRole("button", { name: "Quitar acceso" }).click();
  await page.getByRole("button", { name: "Sí, quitar acceso" }).click();
  await expect(page.getByText(/ya no puede ver tu expediente/)).toBeVisible();

  // 7 — B recibe 403 (servidor, no solo la UI).
  const res = await fetch(`${API}/record-share/grants/${grantId}`, { headers: { Authorization: `Bearer ${doctorB.token}` } });
  expect(res.status).toBe(403);
  await login(page, doctorB);
  await page.goto(`/expediente-compartido/compartidos-conmigo/${grantId}`);
  await expect(page.getByText("No tienes acceso a este expediente compartido.")).toBeVisible();
});
