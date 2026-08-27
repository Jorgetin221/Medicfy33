import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Fase 1 / #20: siembra los datos que la prueba de tableta necesita —
// una doctora verificada y una paciente con la Zona 1 POBLADA
// (alergias, medicamentos, antecedentes, embarazo y 3 consultas
// firmadas con diagnósticos). Todo por la API real; el único paso
// fuera de ella es marcar la verificación de la doctora (no existe
// endpoint público para eso, a propósito) — va directo por psql.
// Requiere la API en API_BASE_URL y Postgres accesible.

const API = process.env.E2E_API_URL ?? "http://localhost:3001";
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://jorgetinoco@localhost:5432/medicfy_mvp_dev";
const PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

async function api<T>(pathname: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function globalSetup(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e.doctora.${suffix}@example.com`;

  const registered = await api<{ userId: string }>("/auth/register/doctor", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "PruebaTableta",
      professionalLicense: String(Math.floor(1000000 + Math.random() * 8999999)),
      primarySpecialtyCode: "GENERAL",
      phone: `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`,
    }),
  });

  // Único paso fuera de la API: la verificación del médico es una cola
  // de admin en el producto — para la prueba se marca directo.
  execFileSync("psql", [
    DB,
    "-q",
    "-c",
    // loginsWithoutMfa muy negativo: M1-RN-005 exige MFA al 4º login
    // sin ella — correcto en producto, pero cada prueba e2e inicia
    // sesión y la doctora sembrada agotaría el margen a media suite.
    // Solo aplica a ESTA cuenta sintética de prueba.
    `UPDATE doctors SET "verificationStatus" = 'VERIFIED' WHERE "userId" = '${registered.userId}'; UPDATE users SET status = 'ACTIVE', "emailVerifiedAt" = now(), "loginsWithoutMfa" = -1000000 WHERE id = '${registered.userId}';`,
  ]);

  const login = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const token = login.accessToken;

  const patient = await api<{ id: string }>("/patients", {
    method: "POST",
    token,
    body: JSON.stringify({
      firstName: "María",
      lastNamePaternal: "TabletaPrueba",
      birthDate: "1994-03-15",
      sexAtBirth: "F",
      phoneE164: `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`,
      email: `e2e.paciente.${suffix}@example.com`,
    }),
  });

  await api(`/records/patients/${patient.id}/allergies`, {
    method: "POST",
    token,
    body: JSON.stringify({
      // Prompt 23A: el agente viene del catálogo (clave), no texto libre.
      agentKey: "penicilinas",
      allergyType: "MEDICAMENTO",
      severity: "GRAVE",
      certainty: "CONFIRMED",
      source: "PACIENTE",
      reaction: "Anafilaxia",
    }),
  });

  await api(`/records/patients/${patient.id}/medications`, {
    method: "POST",
    token,
    body: JSON.stringify({
      genericName: "Metformina",
      dose: "850 mg",
      route: "VO",
      frequency: "cada 12 horas",
      source: "PACIENTE",
    }),
  });

  await api(`/records/patients/${patient.id}/history`, {
    method: "POST",
    token,
    body: JSON.stringify({
      category: "HEREDOFAMILIAR",
      subtype: "diabetes",
      familyRelationship: "MADRE",
      status: "PRESENTE",
    }),
  });

  await api(`/records/patients/${patient.id}/pregnancy`, {
    method: "POST",
    token,
    body: JSON.stringify({ lmpDate: isoDaysAgo(10 * 7) }),
  });

  const icd10 = await api<{ code: string }[]>("/icd10?search=diabetes", { token });
  const icd10Code = icd10[0]?.code;
  for (let i = 0; i < 3; i += 1) {
    const encounter = await api<{ id: string }>(`/records/patients/${patient.id}/encounters`, {
      method: "POST",
      token,
      body: JSON.stringify({ patientId: patient.id, encounterType: i === 0 ? "FIRST_VISIT" : "FOLLOW_UP" }),
    });
    await api(`/records/encounters/${encounter.id}/sign`, {
      method: "POST",
      token,
      body: JSON.stringify({
        chiefComplaint: "Control prenatal y de diabetes",
        currentIllness: "Paciente en control, sin datos de alarma.",
        vitals: {},
        assessment: "Evolución estable.",
        plan: "Continuar manejo, control en 4 semanas.",
        diagnoses: [{ icd10Code, description: "Diabetes mellitus tipo 2", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
      }),
    });
  }

  // Prueba 17.1 (Fase 1): una cita CONFIRMADA de HOY en la agenda de
  // la doctora. El pago no tiene pasarela (billing es esqueleto), y
  // cerca de medianoche MX no existe una hora futura que siga siendo
  // "hoy" — así que la cita se ancla por psql a hace 30 minutos, con
  // estado CONFIRMED, igual que hacen las pruebas de integración con
  // confirmPayment interno.
  // M2-RN-004: agendar exige consultorio activo o teleconsulta — se
  // habilita teleconsulta a la doctora sintética por psql.
  execFileSync("psql", [DB, "-q", "-c", `UPDATE doctors SET "acceptsTeleconsultation" = true WHERE "userId" = '${registered.userId}';`]);
  const service = await api<{ id: string }>("/doctors/me/services", {
    method: "POST",
    token,
    body: JSON.stringify({ serviceType: "FIRST_VISIT", name: "Consulta e2e", durationMinutes: 30, priceMxn: 500 }),
  });
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  inThreeDays.setUTCHours(16, 0, 0, 0);
  const appointment = await api<{ id: string }>("/appointments", {
    method: "POST",
    token,
    body: JSON.stringify({ patientId: patient.id, serviceId: service.id, startsAt: inThreeDays.toISOString() }),
  });
  execFileSync("psql", [
    DB,
    "-q",
    "-c",
    `UPDATE appointments SET status = 'CONFIRMED', "startsAt" = NOW() - interval '30 minutes', "endsAt" = NOW() WHERE id = '${appointment.id}';`,
  ]);

  const statePath = path.join(__dirname, ".e2e-state.json");
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ email, password: PASSWORD, patientId: patient.id, appointmentId: appointment.id }, null, 2));
}
