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
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}
function uniqueCedula(): string {
  return Math.floor(1000000 + Math.random() * 8999999).toString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// Dos hallazgos de la comparación contra medicfy-50-prompts.md:
// (1) IMC nunca se calculaba pese a que weightKg/heightCm ya existían
// en vitalsSchema; (2) isCorrectionOfNoteId/NoteCorrection ya existían
// en el esquema (M8-RN-001: "corregir = nota nueva, nunca UPDATE")
// pero no había servicio ni endpoint que los usara.
describe("Nota clínica — IMC calculado y corrección (adenda) de nota firmada", () => {
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

  async function registerDoctor(verified = true): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "Cruz",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    if (verified) {
      await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    }
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Prueba",
        birthDate: "1990-05-15",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createEncounter(accessToken: string, patientId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function signPayload(overrides: Record<string, unknown> = {}) {
    return {
      chiefComplaint: "Control de rutina",
      currentIllness: "Sin datos de alarma",
      vitals: { weightKg: 78.4, heightCm: 158 },
      assessment: "Sin hallazgos relevantes",
      plan: "Control en 6 meses",
      diagnoses: [{ icd10Code: "Z00.0", description: "Examen médico general", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
      ...overrides,
    };
  }

  describe("IMC calculado en servidor", () => {
    it("78.4 kg y 158 cm firman con bmi=31.4 y la fórmula guardada, nunca confiado del cliente", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      // vitalsSchema es .strict() — un bmi enviado por el cliente se
      // rechaza de entrada, no se ignora en silencio.
      const rejected = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload({ vitals: { weightKg: 78.4, heightCm: 158, bmi: 999 } }));
      expect(rejected.status).toBe(400);

      const signed = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());
      expect(signed.status).toBe(201);
      expect(signed.body.note.vitals.bmi).toBe(31.4);
      expect(signed.body.note.vitals.bmiFormula).toBeTruthy();
    });

    it("sin peso o sin talla, no calcula ni inventa un bmi", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const signed = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload({ vitals: { weightKg: 78.4 } }));
      expect(signed.status).toBe(201);
      expect(signed.body.note.vitals.bmi).toBeUndefined();
    });
  });

  describe("Corrección de nota firmada (adenda)", () => {
    it("inserta una nota nueva referenciando la original — la original nunca se toca, ambas quedan visibles", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const signed = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());
      expect(signed.status).toBe(201);
      const originalNoteId = signed.body.note.id as string;
      const originalCreatedAt = signed.body.note.createdAt;

      const corrected = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/correct-note`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload({ isCorrectionOfNoteId: originalNoteId, assessment: "Corrige: sí hay hallazgo relevante" }));
      expect(corrected.status).toBe(201);
      expect(corrected.body.isCorrectionOfNoteId).toBe(originalNoteId);
      expect(corrected.body.id).not.toBe(originalNoteId);

      const detail = await request(app.getHttpServer())
        .get(`/records/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.notes).toHaveLength(2);
      const original = detail.body.notes.find((n: { id: string }) => n.id === originalNoteId);
      expect(original).toBeDefined();
      expect(original.assessment).toBe("Sin hallazgos relevantes");
      expect(original.createdAt).toBe(originalCreatedAt);
      // El encounter en sí no se vuelve a firmar — sigue con su
      // primer signedAt/contentHashSha256, la corrección no lo toca.
      expect(detail.body.signedAt).toBe(signed.body.encounter.signedAt);
    });

    it("rechaza corregir sobre un encuentro que sigue en DRAFT (409)", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const res = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/correct-note`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload({ isCorrectionOfNoteId: randomUUID() }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ENCOUNTER_NOT_SIGNED");
    });

    it("rechaza corregir una nota que pertenece a otro encuentro (404)", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);

      const encounterA = await createEncounter(doctor.accessToken, patientId);
      const signedA = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterA}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());

      const encounterB = await createEncounter(doctor.accessToken, patientId);
      await request(app.getHttpServer())
        .post(`/records/encounters/${encounterB}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());

      const res = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterB}/correct-note`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload({ isCorrectionOfNoteId: signedA.body.note.id }));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
    });

    it("bloquea a un médico sin verificar, igual que firmar (M1-RN-002)", async () => {
      const unverified = await registerDoctor(false);
      const patientId = await createPatient(unverified.accessToken);
      const encounterId = await createEncounter(unverified.accessToken, patientId);
      // Un médico sin verificar nunca puede firmar de verdad
      // (DoctorVerifiedGuard ya lo bloquea en /sign) — para probar
      // que correct-note tiene el mismo guard, se simula un encuentro
      // ya firmado directo por Prisma, sin pasar por /sign.
      await prisma.clinicalEncounter.update({
        where: { id: encounterId },
        data: { status: "SIGNED", signedAt: new Date(), signedByUserId: unverified.userId, signatureMethod: "INTERNAL_SYSTEM" },
      });
      const note = await prisma.clinicalNote.create({
        data: { encounterId, chiefComplaint: "x", currentIllness: "x", vitals: {}, assessment: "x", plan: "x" },
      });

      const res = await request(app.getHttpServer())
        .post(`/records/encounters/${encounterId}/correct-note`)
        .set("Authorization", `Bearer ${unverified.accessToken}`)
        .send(signPayload({ isCorrectionOfNoteId: note.id }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("DOCTOR_NOT_VERIFIED");
    });
  });
});
