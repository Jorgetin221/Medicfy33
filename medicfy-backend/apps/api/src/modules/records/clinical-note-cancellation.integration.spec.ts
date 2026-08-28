import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { TOTP, Secret } from "otpauth";
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
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}
function uniqueCedula(): string {
  return Math.floor(1000000 + Math.random() * 8999999).toString();
}
function totpFromUri(otpauthUri: string): string {
  const url = new URL(otpauthUri);
  const secret = url.searchParams.get("secret") as string;
  return new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

const SIGN_BODY_BASE = {
  chiefComplaint: "Motivo de prueba para cancelación",
  currentIllness: "Padecimiento de prueba",
  vitals: {},
  assessment: "Análisis de prueba",
  plan: "Plan de prueba",
  diagnoses: [{ description: "Diagnóstico de prueba", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED", codeAbsentReason: "Sin código disponible para esta prueba" }],
};

// Fase 6 · Prompt 44B — "Cancelación: motivo obligatorio tomado de
// catálogo, más firma. El registro se marca cancelado, NUNCA se
// elimina, y sigue siendo consultable." Cubre el flujo feliz, que
// "más firma" de verdad se exige (SignatureVerificationService), que
// no se puede cancelar dos veces, y el mismo hallazgo del Bloque 0
// (comparar patientId/encounterId, no solo el id del recurso).
describe("Cancelación de nota firmada — motivo de catálogo + firma", () => {
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
      legalFirstName: "Fabiola",
      legalLastName: "Nuñez",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function enrollMfa(accessToken: string): Promise<string> {
    const start = await request(app.getHttpServer()).post("/auth/mfa/enroll").set("Authorization", `Bearer ${accessToken}`).send({});
    expect(start.status).toBe(200);
    const otpauthUri = start.body.otpauthUri as string;
    const confirm = await request(app.getHttpServer())
      .post("/auth/mfa/enroll")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: totpFromUri(otpauthUri) });
    expect(confirm.status).toBe(200);
    return otpauthUri;
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Cancelacion",
        birthDate: "1991-02-02",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function signNewNote(accessToken: string, patientId: string, otpauthUri: string): Promise<{ encounterId: string; noteId: string }> {
    const encounter = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(encounter.status).toBe(201);
    const encounterId = encounter.body.id as string;

    const sign = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...SIGN_BODY_BASE, password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(sign.status).toBe(201);
    return { encounterId, noteId: sign.body.note.id as string };
  }

  async function reasonTermId(key: string): Promise<string> {
    const term = await prisma.clinicalCatalogTerm.findFirstOrThrow({ where: { domain: "MOTIVO_CANCELACION_NOTA", key } });
    return term.id;
  }

  it("cancela una nota firmada con motivo+firma, y la línea de tiempo la muestra marcada, no oculta", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);
    const { encounterId, noteId } = await signNewNote(doctor.accessToken, patientId, otpauthUri);

    const cancel = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/notes/${noteId}/cancel`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ reasonTermId: await reasonTermId("error_captura"), password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(cancel.status).toBe(201);
    expect(cancel.body.noteId).toBe(noteId);

    const timeline = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/notes-timeline`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(timeline.status).toBe(200);
    const thread = timeline.body.find((t: { note: { id: string } }) => t.note.id === noteId);
    expect(thread).toBeDefined();
    expect(thread.note.cancellation).not.toBeNull();
    expect(thread.note.cancellation.reasonTerm.preferredTerm).toBe("Error de captura");
  });

  it("rechaza cancelar sin contraseña/TOTP correctos (428), y no cancela la nota", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);
    const { encounterId, noteId } = await signNewNote(doctor.accessToken, patientId, otpauthUri);

    const cancel = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/notes/${noteId}/cancel`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ reasonTermId: await reasonTermId("nota_duplicada"), password: "contraseña-incorrecta", totpCode: "000000" });
    expect(cancel.status).toBe(428);

    const stored = await prisma.clinicalNoteCancellation.findUnique({ where: { noteId } });
    expect(stored).toBeNull();
  });

  it("rechaza cancelar dos veces la misma nota (409)", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);
    const { encounterId, noteId } = await signNewNote(doctor.accessToken, patientId, otpauthUri);

    const first = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/notes/${noteId}/cancel`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ reasonTermId: await reasonTermId("paciente_equivocado"), password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/notes/${noteId}/cancel`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ reasonTermId: await reasonTermId("otro"), reasonFreeText: "segundo intento", password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(second.status).toBe(409);
  });

  it("un noteId que no pertenece al encounterId de la ruta da 404, y no queda cancelado", async () => {
    const owner = await registerDoctor();
    const ownerOtp = await enrollMfa(owner.accessToken);
    const ownerPatientId = await createPatient(owner.accessToken);
    const { noteId: ajenoNoteId } = await signNewNote(owner.accessToken, ownerPatientId, ownerOtp);

    const attacker = await registerDoctor();
    const attackerOtp = await enrollMfa(attacker.accessToken);
    const attackerPatientId = await createPatient(attacker.accessToken);
    const { encounterId: attackerEncounterId } = await signNewNote(attacker.accessToken, attackerPatientId, attackerOtp);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${attackerEncounterId}/notes/${ajenoNoteId}/cancel`)
      .set("Authorization", `Bearer ${attacker.accessToken}`)
      .send({ reasonTermId: await reasonTermId("otro"), reasonFreeText: "ataque", password: STRONG_PASSWORD, totpCode: totpFromUri(attackerOtp) });
    expect(res.status).toBe(404);

    const stored = await prisma.clinicalNoteCancellation.findUnique({ where: { noteId: ajenoNoteId } });
    expect(stored).toBeNull();
  });
});
