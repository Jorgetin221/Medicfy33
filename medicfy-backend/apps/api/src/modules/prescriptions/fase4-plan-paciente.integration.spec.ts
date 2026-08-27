import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "../identity/services/notification.port";
import { TokenService } from "../identity/services/token.service";

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}
function uniquePhone(): string {
  return `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`;
}
function uniqueCedula(): string {
  return Math.floor(1000000 + Math.random() * 8999999).toString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const BASE_NOTE = {
  chiefComplaint: "Control clínico",
  currentIllness: "Paciente en seguimiento, sin datos de alarma.",
  assessment: "Evolución estable.",
  plan: "Continuar manejo.",
  vitals: {},
};
const JUSTIFICACION = "Alergia referida dudosa; sin alternativa terapéutica y bajo vigilancia en consultorio.";

// Fase 4 (prompts 32-38) — pruebas literales del prompt 38B: el plan
// del paciente (receta, interacciones, herencia de receta, órdenes
// con motivo, PDFs con bitácora y medicación vigente).
describe("Fase 4 · Plan del paciente (prompt 38B)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(new TestNotificationAdapter())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "Fase4",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    return { userId, accessToken: tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" }) };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer()).post("/patients").set("Authorization", `Bearer ${accessToken}`).send({
      firstName: "Paciente",
      lastNamePaternal: "PlanFase4",
      birthDate: "1988-04-02",
      sexAtBirth: "F",
      phoneE164: uniquePhone(),
      email: uniqueEmail("patient"),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // Prompt 32: la receta pertenece a una nota FIRMADA — el flujo
  // completo de firma se prueba en fase3; aquí se firma por la API
  // real (sin diagnóstico ICD no hace falta para esta fase).
  async function signedEncounter(accessToken: string, patientId: string, extra: Record<string, unknown> = {}): Promise<string> {
    const enc = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    expect(enc.status).toBe(201);
    const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;
    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${enc.body.id}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...BASE_NOTE,
        diagnoses: [{ icd10Code, description: "Control", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
        ...extra,
      });
    expect(signed.status).toBe(201);
    return enc.body.id as string;
  }

  async function medId(genericName: string): Promise<string> {
    return (await prisma.medicationCatalog.findFirstOrThrow({ where: { genericName } })).id;
  }

  function line(medicationCatalogId: string, extra: Record<string, unknown> = {}) {
    return { medicationCatalogId, dose: "500", doseUnit: "mg", route: "VO", frequency: "cada 8 horas", duration: "7 días", indication: "según indicación de la nota", ...extra };
  }

  async function registerPenicillinAllergy(accessToken: string, patientId: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ agentKey: "penicilinas", allergyType: "MEDICAMENTO", severity: "GRAVE", certainty: "CONFIRMED", source: "PACIENTE", reaction: "Anafilaxia" });
    expect(res.status).toBe(201);
  }

  it("Fase 4b — un borrador (no abandonado) SÍ emite receta y orden: ya no exige nota firmada", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const draft = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(draft.status).toBe(201);

    const receta = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${draft.body.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dx", items: [line(await medId("Paracetamol"))] });
    expect(receta.status).toBe(201);

    const orden = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${draft.body.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Dx", items: [{ studyKey: "bh", motiveKey: "diagnostico_inicial" }] });
    expect(orden.status).toBe(201);
  });

  it("Fase 4b — un borrador ABANDONADO (>72h sin firmar) sigue bloqueado para receta y orden", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const draft = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(draft.status).toBe(201);
    await prisma.clinicalEncounter.update({
      where: { id: draft.body.id },
      data: { startedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) },
    });

    const receta = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${draft.body.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dx", items: [line(await medId("Paracetamol"))] });
    expect(receta.status).toBe(422);
    expect(receta.body.error.code).toBe("PRESCRIPTION_ENCOUNTER_NOT_EDITABLE");

    const orden = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${draft.body.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Dx", items: [{ studyKey: "bh", motiveKey: "diagnostico_inicial" }] });
    expect(orden.status).toBe(422);
    expect(orden.body.error.code).toBe("LAB_ORDER_ENCOUNTER_NOT_EDITABLE");
  });

  it("38.1 — alergia a penicilinas + amoxicilina: bloquea, exige justificación clínica, y la justificación queda firmada y en bitácora", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    await registerPenicillinAllergy(doctor.accessToken, patientId);
    const encounterId = await signedEncounter(doctor.accessToken, patientId);
    const amoxi = await medId("Amoxicilina");

    // Sin justificación → 409 con la explicación del conflicto.
    const blocked = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Faringoamigdalitis", items: [line(amoxi)] });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PRESCRIPTION_ALLERGY_CONFLICT");

    // Una justificación demasiado corta no libera el candado (schema).
    const short = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Faringoamigdalitis", allergyOverrideJustification: "porque sí", items: [line(amoxi)] });
    expect(short.status).toBe(400);

    // Con justificación clínica → emite, la guarda en la receta y en bitácora.
    const ok = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Faringoamigdalitis", allergyOverrideJustification: JUSTIFICACION, items: [line(amoxi)] });
    expect(ok.status).toBe(201);
    const row = await prisma.prescription.findUniqueOrThrow({ where: { id: ok.body.prescription.id } });
    expect(row.allergyOverrideJustification).toBe(JUSTIFICACION);

    const overrideLog = await prisma.auditLog.findFirst({ where: { patientId, action: "PRESCRIPTION_ALLERGY_OVERRIDE" } });
    expect(overrideLog?.justification).toBe(JUSTIFICACION);
    const shownLog = await prisma.auditLog.findFirst({ where: { patientId, action: "PRESCRIPTION_ALLERGY_CONFLICT_SHOWN" } });
    expect(shownLog).toBeTruthy();
  });

  it("38.2 — interacción GRAVE (Tramadol+Diazepam, par de demostración): exige confirmación explícita; MODERADA solo informa; todo queda en bitácora", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await signedEncounter(doctor.accessToken, patientId);
    const [tramadol, diazepam] = await Promise.all([medId("Tramadol"), medId("Diazepam")]);

    const blocked = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dolor y espasmo", items: [line(tramadol), line(diazepam)] });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PRESCRIPTION_INTERACTION_GRAVE");
    expect(blocked.body.error.details.interactions[0].severity).toBe("GRAVE");

    const confirmed = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dolor y espasmo", interactionOverrideConfirmed: true, items: [line(tramadol), line(diazepam)] });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.interactionWarnings.some((w: { severity: string }) => w.severity === "GRAVE")).toBe(true);

    const logs = await prisma.auditLog.findMany({ where: { patientId, action: { in: ["PRESCRIPTION_INTERACTION_GRAVE_SHOWN", "PRESCRIPTION_INTERACTION_GRAVE_CONFIRMED"] } } });
    expect(logs.some((l) => l.action === "PRESCRIPTION_INTERACTION_GRAVE_SHOWN")).toBe(true);
    expect(logs.some((l) => l.action === "PRESCRIPTION_INTERACTION_GRAVE_CONFIRMED")).toBe(true);

    // MODERADA (Ibuprofeno + Losartán vigente): informa sin bloquear.
    // La medicación vigente entra al cruce — no solo lo que se escribe.
    const patient2 = await createPatient(doctor.accessToken);
    const enc2 = await signedEncounter(doctor.accessToken, patient2);
    const losartanRes = await request(app.getHttpServer())
      .post(`/records/patients/${patient2}/medications`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ genericName: "Losartán", dose: "50 mg", route: "VO", frequency: "cada 24 horas", source: "PACIENTE" });
    expect(losartanRes.status).toBe(201);

    const moderada = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${enc2}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Lumbalgia", items: [line(await medId("Ibuprofeno"))] });
    expect(moderada.status).toBe(201);
    expect(moderada.body.interactionWarnings.some((w: { severity: string }) => w.severity === "MODERADA")).toBe(true);
    const modLog = await prisma.auditLog.findFirst({ where: { patientId: patient2, action: "PRESCRIPTION_INTERACTION_MODERADA_SHOWN" } });
    expect(modLog).toBeTruthy();
  });

  it("38.3 — traer última receta: líneas EDITABLES con procedencia y fecha de origen; el servidor revalida la receta de origen", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const enc1 = await signedEncounter(doctor.accessToken, patientId);
    const metformina = await medId("Metformina");

    const first = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${enc1}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "DM2", items: [line(metformina, { dose: "850", frequency: "cada 12 horas" })] });
    expect(first.status).toBe(201);

    const last = await request(app.getHttpServer())
      .get(`/prescriptions/patients/${patientId}/last`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(last.status).toBe(200);
    expect(last.body.prescription.id).toBe(first.body.prescription.id);
    expect(last.body.lines).toHaveLength(1);
    expect(last.body.lines[0].origin).toBe("HEREDADA");
    expect(last.body.lines[0].sourcePrescriptionId).toBe(first.body.prescription.id);
    expect(last.body.lines[0].sourceIssuedAt).toBeTruthy();

    // Reemitir editando la línea heredada: procedencia HEREDADA_MODIFICADA.
    const enc2 = await signedEncounter(doctor.accessToken, patientId);
    const reissued = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${enc2}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        signatureRoute: "HANDWRITTEN_AFTER_PRINT",
        diagnosisSnapshot: "DM2",
        items: [line(metformina, { dose: "1000", frequency: "cada 12 horas", origin: "HEREDADA_MODIFICADA", sourcePrescriptionId: first.body.prescription.id })],
      });
    expect(reissued.status).toBe(201);
    const item = await prisma.prescriptionItem.findFirstOrThrow({ where: { prescriptionId: reissued.body.prescription.id } });
    expect(item.origin).toBe("HEREDADA_MODIFICADA");
    expect(item.sourcePrescriptionId).toBe(first.body.prescription.id);
    expect(item.sourceIssuedAt).toBeTruthy();

    // Una procedencia inventada (receta de otro paciente/médico) no pasa.
    const fake = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${enc2}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        signatureRoute: "HANDWRITTEN_AFTER_PRINT",
        diagnosisSnapshot: "DM2",
        items: [line(metformina, { origin: "HEREDADA", sourcePrescriptionId: randomUUID() })],
      });
    expect(fake.status).toBe(422);
    expect(fake.body.error.code).toBe("PRESCRIPTION_SOURCE_INVALID");
  });

  it("38.4 — orden de estudios sin motivo: no se emite; el estudio y el motivo vienen del catálogo", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await signedEncounter(doctor.accessToken, patientId);

    // Sin motiveKey → rechazo estructural del contrato (400).
    const sinMotivo = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Control", items: [{ studyKey: "bh" }] });
    expect(sinMotivo.status).toBe(400);

    // Motivo que no existe en el catálogo → 422 con el mensaje de la regla.
    const motivoFalso = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Control", items: [{ studyKey: "bh", motiveKey: "porque_quiero" }] });
    expect(motivoFalso.status).toBe(422);
    expect(motivoFalso.body.error.code).toBe("LAB_ORDER_MOTIVE_REQUIRED");

    // Estudio fuera de catálogo → 422 (R2: se solicita al curador, no texto libre).
    const estudioFalso = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Control", items: [{ studyKey: "estudio_inventado", motiveKey: "diagnostico_inicial" }] });
    expect(estudioFalso.status).toBe(422);
    expect(estudioFalso.body.error.code).toBe("LAB_ORDER_STUDY_NOT_IN_CATALOG");

    // Con estudio Y motivo del catálogo → emite, con el nombre del
    // catálogo (no viaja del cliente) y ambos términos anclados.
    const ok = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", clinicalIndication: "Control", items: [{ studyKey: "bh", motiveKey: "control_seguimiento" }] });
    expect(ok.status).toBe(201);
    const item = await prisma.labOrderItem.findFirstOrThrow({ where: { labOrderId: ok.body.id } });
    expect(item.studyTermId).toBeTruthy();
    expect(item.motiveTermId).toBeTruthy();
    expect(item.studyName.toLowerCase()).toContain("biometría");
  });

  it("38.5 — cada documento es un PDF independiente con nombre y cédula, y su emisión e impresión quedan en bitácora con folio", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await signedEncounter(doctor.accessToken, patientId, {
      patientInstructions: "Tomar el medicamento con alimentos. Regresar si hay fiebre o dolor intenso.",
      suggestedFollowUpDays: 30,
    });

    const receta = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dx", items: [line(await medId("Paracetamol"))] });
    expect(receta.status).toBe(201);
    const prescriptionId = receta.body.prescription.id as string;
    const folio = receta.body.prescription.folio as string;

    // PDF de la receta (nombre/cédula van en el PDF vía snapshot legal).
    const pdf = await request(app.getHttpServer()).get(`/prescriptions/${prescriptionId}/pdf`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    // Emisión en bitácora, con folio.
    const emitted = await prisma.auditLog.findFirst({ where: { action: "DOCUMENT_EMITTED", resourceId: prescriptionId } });
    expect(emitted).toBeTruthy();
    expect((emitted?.metadata as { folio?: string })?.folio).toBe(folio);

    // Impresión registrada por documento — cuántas veces, por quién.
    const printed = await request(app.getHttpServer())
      .post(`/prescriptions/${prescriptionId}/register-printed`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(printed.status).toBe(201);
    const printedLog = await prisma.auditLog.findFirst({ where: { action: "DOCUMENT_PRINTED", resourceId: prescriptionId } });
    expect((printedLog?.metadata as { folio?: string })?.folio).toBe(folio);

    // PDF de INDICACIONES AL PACIENTE — documento propio, desde la nota firmada.
    const indicaciones = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/indicaciones/pdf`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(indicaciones.status).toBe(200);
    expect(indicaciones.headers["content-type"]).toContain("application/pdf");
  });

  it("38.6 — la medicación vigente del paciente refleja la receta emitida, automáticamente", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await signedEncounter(doctor.accessToken, patientId);

    const receta = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "DM2", items: [line(await medId("Metformina"), { dose: "850", frequency: "cada 12 horas" })] });
    expect(receta.status).toBe(201);

    const vigente = await prisma.patientMedication.findFirst({ where: { patientId, genericName: "Metformina", status: "ACTIVE" } });
    expect(vigente).toBeTruthy();
    expect(vigente?.dose).toBe("850 mg");
    expect(vigente?.source).toBe("MEDICO");

    // Reemitir con dosis distinta ACTUALIZA la vigente — no duplica.
    const enc2 = await signedEncounter(doctor.accessToken, patientId);
    const otra = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${enc2}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "DM2", items: [line(await medId("Metformina"), { dose: "1000", frequency: "cada 12 horas" })] });
    expect(otra.status).toBe(201);

    const vigentes = await prisma.patientMedication.findMany({ where: { patientId, genericName: "Metformina", status: "ACTIVE" } });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.dose).toBe("1000 mg");
  });
});
