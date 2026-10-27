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
import { givePrimaryPracticeLocation } from "../../testing/practice-location.fixture";
import { ClinicalEncounterService } from "./services/clinical-encounter.service";

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
  return `+52${Math.floor(1000000000 + Math.random() * 8999999999).toString()}`;
}
function uniqueCedula(): string {
  return Math.floor(10000000 + Math.random() * 89999999).toString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const NOTE = {
  chiefComplaint: "Control de seguimiento",
  currentIllness: "Sin cambios.",
  vitals: {},
  assessment: "Estable.",
  plan: "Continuar.",
};
const TWO_DIAGNOSES = [
  { description: "Diagnóstico B", diagnosisType: "SECONDARY", certainty: "SUSPECTED" },
  { description: "Diagnóstico A", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
];

// Auditoría integral 2026-10-21 — una prueba negativa por hallazgo de
// records (pertenencia, autoría, firma atómica, integridad, borrador).
describe("Auditoría 2026-10-21 — records", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let encounterService: ClinicalEncounterService;

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
    encounterService = moduleRef.get(ClinicalEncounterService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function registerDoctor(): Promise<{ userId: string; doctorId: string; accessToken: string }> {
    const res = await http().post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "Auditoría",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const doctor = await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    return { userId, doctorId: doctor.id, accessToken: tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" }) };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await http().post("/patients").set("Authorization", `Bearer ${accessToken}`).send({
      firstName: "Paciente",
      lastNamePaternal: "Auditoría",
      birthDate: "1985-02-02",
      sexAtBirth: "M",
      phoneE164: uniquePhone(),
      email: uniqueEmail("patient"),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function grantCareRelationship(patientId: string, doctorId: string): Promise<void> {
    await prisma.careRelationship.create({
      data: { patientId, doctorId, origin: "PATIENT_GRANTED", expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
  }

  async function startEncounter(accessToken: string, patientId: string, appointmentId?: string) {
    return http()
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP", ...(appointmentId ? { appointmentId } : {}) });
  }

  async function signEncounter(accessToken: string, encounterId: string, diagnoses: unknown[] = TWO_DIAGNOSES) {
    return http().post(`/records/encounters/${encounterId}/sign`).set("Authorization", `Bearer ${accessToken}`).send({ ...NOTE, diagnoses });
  }

  async function bookAppointment(doctor: { accessToken: string }, patientId: string): Promise<string> {
    const service = await http()
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
    expect(service.status).toBe(201);
    const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const appt = await http()
      .post("/appointments")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, serviceId: service.body.id, startsAt });
    expect(appt.status).toBe(201);
    return appt.body.id as string;
  }

  it("A-02: an appointment of another patient/doctor cannot be attached to an encounter", async () => {
    const owner = await registerDoctor();
    await prisma.doctor.update({ where: { id: owner.doctorId }, data: { acceptsTeleconsultation: true } });
    const ownerPatient = await createPatient(owner.accessToken);
    const appointmentId = await bookAppointment(owner, ownerPatient);

    const intruder = await registerDoctor();
    const intruderPatient = await createPatient(intruder.accessToken);
    const res = await startEncounter(intruder.accessToken, intruderPatient, appointmentId);
    expect(res.status).toBe(404);

    const ownEncounter = await startEncounter(owner.accessToken, ownerPatient, appointmentId);
    expect(ownEncounter.status).toBe(201);
  });

  it("A-03: another doctor with a care relationship cannot edit, sign or cancel someone else's draft/documents", async () => {
    const author = await registerDoctor();
    const patientId = await createPatient(author.accessToken);
    const other = await registerDoctor();
    await grantCareRelationship(patientId, other.doctorId);

    const encounter = await startEncounter(author.accessToken, patientId);
    const encounterId = encounter.body.id as string;

    const read = await http().get(`/records/encounters/${encounterId}`).set("Authorization", `Bearer ${other.accessToken}`);
    expect(read.status).toBe(200);

    const edit = await http()
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ plan: "Plan de otro médico" });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe("NOT_RESOURCE_AUTHOR");

    const sign = await signEncounter(other.accessToken, encounterId);
    expect(sign.status).toBe(403);

    const denied = await prisma.auditLog.findFirst({
      where: { action: "clinical.authorship", actorUserId: other.userId, resourceId: encounterId, result: "DENIED" },
    });
    expect(denied).not.toBeNull();

    const ownSign = await signEncounter(author.accessToken, encounterId);
    expect(ownSign.status).toBe(201);
  });

  it("A-06: a lab analyte cannot hang from another patient's lab order", async () => {
    const doctor = await registerDoctor();
    const patientA = await createPatient(doctor.accessToken);
    const foreignOrder = await prisma.labOrder.findFirst({ where: { patientId: { not: patientA } }, select: { id: true } });
    const labOrderId = foreignOrder?.id ?? randomUUID();

    const res = await http()
      .post(`/lab-analytes/patients/${patientA}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ labOrderId, analyteName: "Glucosa", value: 98, unit: "mg/dL", measuredAt: new Date().toISOString().slice(0, 10) });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("LAB_ORDER_NOT_FOUND");
  });

  it("A-08: two concurrent signatures of the same draft produce exactly one note", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const encounterId = encounter.body.id as string;

    const [a, b] = await Promise.all([signEncounter(doctor.accessToken, encounterId), signEncounter(doctor.accessToken, encounterId)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const notes = await prisma.clinicalNote.count({ where: { encounterId, isCorrectionOfNoteId: null } });
    expect(notes).toBe(1);
  });

  it("A-09: a signed note with several diagnoses verifies OK", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    expect((await signEncounter(doctor.accessToken, encounter.body.id as string)).status).toBe(201);

    const check = await http().get(`/records/patients/${patientId}/integrity-check`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(check.status).toBe(200);
    expect(check.body).toHaveLength(1);
    expect(check.body[0].status).toBe("OK");
  });

  it("A-10: an addendum records its author and seal, and a cancelled note cannot be corrected", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const encounterId = encounter.body.id as string;
    const signed = await signEncounter(doctor.accessToken, encounterId);
    const noteId = signed.body.note.id as string;
    expect(signed.body.note.authorUserId).toBe(doctor.userId);

    const correction = await http()
      .post(`/records/encounters/${encounterId}/correct-note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...NOTE, plan: "Plan corregido.", diagnoses: TWO_DIAGNOSES, isCorrectionOfNoteId: noteId });
    expect(correction.status).toBe(201);
    expect(correction.body.authorUserId).toBe(doctor.userId);
    expect(correction.body.contentHashSha256).toMatch(/^[0-9a-f]{64}$/);

    const check = await http().get(`/records/patients/${patientId}/integrity-check`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(check.body[0].status).toBe("OK");

    const reason = await prisma.clinicalCatalogTerm.findFirstOrThrow({ where: { domain: "MOTIVO_CANCELACION_NOTA" } });
    const cancel = await http()
      .post(`/records/encounters/${encounterId}/notes/${noteId}/cancel`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ reasonTermId: reason.id, reasonFreeText: "Paciente equivocado", password: STRONG_PASSWORD });
    expect(cancel.status).toBe(201);

    const afterCancel = await http()
      .post(`/records/encounters/${encounterId}/correct-note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...NOTE, diagnoses: TWO_DIAGNOSES, isCorrectionOfNoteId: noteId });
    expect(afterCancel.status).toBe(409);
    expect(afterCancel.body.error.code).toBe("NOTE_CANCELLED");
  });

  it("M-12: an abandoned draft stays locked on every later attempt, not only the first", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const encounterId = encounter.body.id as string;
    await prisma.clinicalEncounter.update({ where: { id: encounterId }, data: { startedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) } });

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await http().patch(`/records/encounters/${encounterId}/note`).set("Authorization", `Bearer ${doctor.accessToken}`).send({ plan: "x" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ENCOUNTER_ABANDONED");
    }
    expect((await signEncounter(doctor.accessToken, encounterId)).status).toBe(409);
  });

  // Pedido explícito del usuario (2026-10-27): un borrador abandonado
  // (72 h) ya no puede completar su cita con nota firmada — la cita se
  // cierra sola por el camino de "consulta sin nota" (M5-RN-006), para
  // que no se quede IN_PROGRESS para siempre. El borrador en sí NUNCA
  // se borra (R1/NOM-004) — solo deja de ser editable (ya cubierto por
  // M-12 arriba).
  it("EncounterSweepService: cierra sola (sin nota) la cita de un borrador abandonado que nadie volvió a tocar", async () => {
    const doctor = await registerDoctor();
    await prisma.doctor.update({ where: { id: doctor.doctorId }, data: { acceptsTeleconsultation: true } });
    const patientId = await createPatient(doctor.accessToken);
    const appointmentId = await bookAppointment(doctor, patientId);
    const start = await http().post(`/appointments/${appointmentId}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(start.status).toBe(201);

    const encounter = await startEncounter(doctor.accessToken, patientId, appointmentId);
    expect(encounter.status).toBe(201);
    const encounterId = encounter.body.id as string;
    await prisma.clinicalEncounter.update({ where: { id: encounterId }, data: { startedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) } });

    const closed = await encounterService.closeAbandonedEncounters();
    expect(closed).toBeGreaterThanOrEqual(1);

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("COMPLETED");
    expect(appointment.completedWithoutNoteReason).toContain("72 h");

    // El borrador NUNCA se borra (R1/NOM-004) — sigue existiendo, solo
    // queda marcado como abandonado.
    const draft = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(draft.status).toBe("DRAFT");
    expect(draft.abandonedAt).not.toBeNull();

    // Idempotente: una segunda pasada no vuelve a tocar una cita que
    // ya no está IN_PROGRESS.
    await expect(encounterService.closeAbandonedEncounters()).resolves.toBeGreaterThanOrEqual(1);
    const appointmentAfterSecondSweep = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointmentAfterSecondSweep.status).toBe("COMPLETED");
  });

  it("M-13: a stale draftVersion gets 409 DRAFT_CONFLICT instead of overwriting", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const encounterId = encounter.body.id as string;

    const first = await http()
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ plan: "Pestaña 1", expectedDraftVersion: 0 });
    expect(first.status).toBe(200);
    expect(first.body.draftVersion).toBe(1);

    const stale = await http()
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ plan: "Pestaña 2", expectedDraftVersion: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("DRAFT_CONFLICT");

    const stored = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect((stored.draftContent as { plan?: string }).plan).toBe("Pestaña 1");
  });
  async function paracetamolItem() {
    const med = await prisma.medicationCatalog.findFirstOrThrow({ where: { genericName: "Paracetamol" } });
    return { medicationCatalogId: med.id, dose: "500 mg", route: "oral", frequency: "cada 8h", duration: "3 días" };
  }

  it("A-13: no prescription is issued without the doctor's professional address, and the snapshot uses the legal name", async () => {
    const doctor = await registerDoctor();
    await prisma.doctor.update({ where: { id: doctor.doctorId }, data: { displayName: "Dra. Comercial" } });
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const body = { signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Cefalea", items: [await paracetamolItem()] };

    const blocked = await http().post(`/prescriptions/encounters/${encounter.body.id}`).set("Authorization", `Bearer ${doctor.accessToken}`).send(body);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("PRESCRIPTION_MISSING_LEGAL_FIELD");

    await givePrimaryPracticeLocation(prisma, doctor.userId);
    const issued = await http().post(`/prescriptions/encounters/${encounter.body.id}`).set("Authorization", `Bearer ${doctor.accessToken}`).send(body);
    expect(issued.status).toBe(201);
    expect(issued.body.prescription.doctorNameSnapshot).toBe("Ana Auditoría");
    expect(issued.body.prescription.practiceAddressSnapshot).toContain("Guadalajara");
  });

  it("A-14: retrying a prescription with the same Idempotency-Key returns the same prescription, never a second folio", async () => {
    const doctor = await registerDoctor();
    await givePrimaryPracticeLocation(prisma, doctor.userId);
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    const body = { signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Cefalea", items: [await paracetamolItem()] };
    const key = randomUUID();

    const send = () =>
      http()
        .post(`/prescriptions/encounters/${encounter.body.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .set("Idempotency-Key", key)
        .send(body);
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.prescription.id).toBe(b.body.prescription.id);
    expect(await prisma.prescription.count({ where: { encounterId: encounter.body.id as string } })).toBe(1);

    const badKey = await http()
      .post(`/prescriptions/encounters/${encounter.body.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .set("Idempotency-Key", "no-es-uuid")
      .send(body);
    expect(badKey.status).toBe(400);
  });

  it("A-14: retrying an appointment with the same Idempotency-Key returns the same appointment", async () => {
    const doctor = await registerDoctor();
    await prisma.doctor.update({ where: { id: doctor.doctorId }, data: { acceptsTeleconsultation: true } });
    const patientId = await createPatient(doctor.accessToken);
    const service = await http()
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
    const key = randomUUID();
    const startsAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const send = () =>
      http()
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .set("Idempotency-Key", key)
        .send({ patientId, serviceId: service.body.id, startsAt });
    const first = await send();
    const retry = await send();
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
  });
  it("A-05: a suspended doctor loses clinical access, and a suspended user's live token stops working", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const allergies = () => http().get(`/records/patients/${patientId}/allergies`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect((await allergies()).status).toBe(200);

    await prisma.doctor.update({ where: { id: doctor.doctorId }, data: { verificationStatus: "SUSPENDED" } });
    const asSuspendedDoctor = await allergies();
    expect(asSuspendedDoctor.status).toBe(403);
    expect(asSuspendedDoctor.body.error.code).toBe("DOCTOR_SUSPENDED");

    await prisma.user.update({ where: { id: doctor.userId }, data: { status: "SUSPENDED" } });
    expect((await http().get("/me").set("Authorization", `Bearer ${doctor.accessToken}`)).status).toBe(401);
  });
  it("M-14: the request id reaches audit_log and the error body, and an incoming X-Request-Id is honoured", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const requestId = randomUUID();
    const read = await http()
      .get(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .set("X-Request-Id", requestId);
    expect(read.status).toBe(200);
    expect(read.headers["x-request-id"]).toBe(requestId);
    const row = await prisma.auditLog.findFirst({ where: { requestId, actorUserId: doctor.userId } });
    expect(row).not.toBeNull();
    expect(row?.ipAddress).toBeTruthy();

    const failing = await http().get(`/records/encounters/${randomUUID()}`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(failing.body.error.request_id).toBe(failing.headers["x-request-id"]);
  });
  it("M-23: notes can be searched with the text in the body, not the URL", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounter = await startEncounter(doctor.accessToken, patientId);
    expect((await signEncounter(doctor.accessToken, encounter.body.id as string)).status).toBe(201);

    const res = await http()
      .post(`/records/patients/${patientId}/notes-timeline/search`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ q: "Control" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
