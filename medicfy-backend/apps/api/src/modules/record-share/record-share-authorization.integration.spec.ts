import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { CareRelationshipService } from "../scheduling/services/care-relationship.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "./record-share-notification.port";
import { sha256Hex } from "./record-share-crypto.util";
import type { ShareScope } from "@medicfy/contracts";

/**
 * PR-EXP-03 — Autorización del paciente. Cubre el criterio de
 * terminación completo: OTP correcto aprueba, 5 fallos bloquean 1h,
 * OTP usado no se reutiliza, OTP vencido falla, enlace vencido falla,
 * el alcance/duración no se puede ampliar por manipulación directa de
 * la API, sensibles excluidas por defecto, consentimiento con versión
 * y hash, eventos en audit_log. Mismo patrón de arranque que
 * record-share-request.integration.spec.ts.
 */
class RecordingNotificationAdapter implements RecordShareNotificationPort {
  public otpCodes: string[] = [];
  async sendAuthorizationRequest(): Promise<void> {}
  async sendOtpCode(input: { code: string }): Promise<void> {
    this.otpCodes.push(input.code);
  }
  // PR-EXP-06: la confirmación lleva el enlace de revocación.
  public revocationUrls: string[] = [];
  async sendApprovalConfirmation(input: { revocationUrl: string }): Promise<void> {
    this.revocationUrls.push(input.revocationUrl);
  }
  async sendRevocationNotice(): Promise<void> {}
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}
function uniquePhone(): string {
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}
function uniqueCedula(): string {
  return Math.floor(10000000 + Math.random() * 89999999).toString();
}

describe("Expediente compartido — PR-EXP-03 (autorización del paciente)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let careRelationshipService: CareRelationshipService;
  let notifications: RecordingNotificationAdapter;

  beforeAll(async () => {
    notifications = new RecordingNotificationAdapter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RECORD_SHARE_NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    careRelationshipService = moduleRef.get(CareRelationshipService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerVerifiedDoctor(legalFirstName: string): Promise<{ userId: string; doctorId: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName,
      legalLastName: "ExpCompartido",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    return { userId, doctorId: doctor.id };
  }

  async function createPendingRequest(overrides: { expiresAt?: Date; requestedScope?: ShareScope[]; requestedDurationDays?: number } = {}) {
    const requester = await registerVerifiedDoctor("Solicitante");
    const custodian = await registerVerifiedDoctor("Custodio");
    const patient = await prisma.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: "María José",
        lastNamePaternal: "Peña",
        birthDate: new Date("1990-03-15"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        source: "CREATED_BY_DOCTOR",
      },
    });
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");

    const plainToken = randomUUID();
    const requestRow = await prisma.recordShareRequest.create({
      data: {
        requesterDoctorId: requester.doctorId,
        custodianDoctorId: custodian.doctorId,
        patientId: patient.id,
        reason: "Valoración por dolor torácico y antecedentes",
        requestedScope: overrides.requestedScope ?? ["SUMMARY"],
        requestedDurationDays: overrides.requestedDurationDays ?? 30,
        linkTokenHash: sha256Hex(plainToken),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    return { requester, custodian, patient, requestRow, token: plainToken };
  }

  async function sendAndGetOtp(token: string): Promise<string> {
    notifications.otpCodes = [];
    const res = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp`);
    expect(res.status).toBe(200);
    const code = notifications.otpCodes.at(-1);
    if (!code) throw new Error("OTP code was never sent");
    return code;
  }

  it("GET info nunca revela nada del paciente ni del custodio (RE9) y falla genérico con enlace vencido", async () => {
    const { token } = await createPendingRequest();
    const ok = await request(app.getHttpServer()).get(`/record-share/authorize/${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      requesterDisplayName: expect.any(String),
      requesterLicense: expect.any(String),
      requesterSpecialtyName: expect.anything(),
      reason: expect.any(String),
      requestedScope: expect.any(Array),
      requestedDurationDays: expect.any(Number),
      consentTextVersion: expect.any(String),
      consentText: expect.any(String),
    });
    expect(JSON.stringify(ok.body)).not.toMatch(/patient|paciente/i);

    const { token: expiredToken } = await createPendingRequest({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await request(app.getHttpServer()).get(`/record-share/authorize/${expiredToken}`);
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe("RECORD_SHARE_LINK_INVALID");
  });

  it("OTP correcto aprueba, con versión y hash de consentimiento guardados", async () => {
    const { token, requestRow } = await createPendingRequest();
    const code = await sendAndGetOtp(token);

    const verify = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code });
    expect(verify.status).toBe(200);

    const decide = await request(app.getHttpServer())
      .post(`/record-share/authorize/${token}/decide`)
      .send({ decision: "APPROVED", approvedScope: ["SUMMARY"], includedSensitiveCategories: [], pregnancyExcluded: false, durationDays: 7 });
    expect(decide.status).toBe(200);
    expect(decide.body).toEqual({ status: "APPROVED" });

    const consent = await prisma.recordShareConsent.findUniqueOrThrow({ where: { requestId: requestRow.id } });
    expect(consent.consentTextVersion).toBeTruthy();
    expect(consent.consentTextSha256).toMatch(/^[0-9a-f]{64}$/);
    // Sensibles excluidas por defecto: ninguna incluida → las 5 en excludedCategories del grant.
    const grant = await prisma.recordShareGrant.findUniqueOrThrow({ where: { consentId: consent.id } });
    expect(grant.excludedCategories.sort()).toEqual(["GENETIC", "HIV_STI", "MENTAL_HEALTH", "REPRODUCTIVE_HEALTH", "SUBSTANCE_USE"]);
    expect(grant.status).toBe("ACTIVE");

    const updatedRequest = await prisma.recordShareRequest.findUniqueOrThrow({ where: { id: requestRow.id } });
    expect(updatedRequest.status).toBe("APPROVED");
  });

  it("rechazar (DENIED) crea consentimiento sin grant, y el evento queda en audit_log", async () => {
    const { token, requestRow } = await createPendingRequest();
    const code = await sendAndGetOtp(token);
    await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code });

    const decide = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/decide`).send({ decision: "DENIED" });
    expect(decide.status).toBe(200);
    expect(decide.body).toEqual({ status: "DENIED" });

    const consent = await prisma.recordShareConsent.findUniqueOrThrow({ where: { requestId: requestRow.id } });
    expect(consent.decision).toBe("DENIED");
    const grant = await prisma.recordShareGrant.findFirst({ where: { consentId: consent.id } });
    expect(grant).toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: "SHARE_DENIED", resourceId: requestRow.id } });
    expect(audit).not.toBeNull();
  });

  it("el alcance/duración no se pueden ampliar por manipulación directa de la API", async () => {
    const { token } = await createPendingRequest({ requestedScope: ["SUMMARY"], requestedDurationDays: 7 });
    const code = await sendAndGetOtp(token);
    await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code });

    const scopeAttack = await request(app.getHttpServer())
      .post(`/record-share/authorize/${token}/decide`)
      .send({ decision: "APPROVED", approvedScope: ["SUMMARY", "SIGNED_NOTES"], includedSensitiveCategories: [], pregnancyExcluded: false, durationDays: 7 });
    expect(scopeAttack.status).toBe(422);
    expect(scopeAttack.body.error.code).toBe("RECORD_SHARE_SCOPE_EXCEEDS_REQUEST");

    const durationAttack = await request(app.getHttpServer())
      .post(`/record-share/authorize/${token}/decide`)
      .send({ decision: "APPROVED", approvedScope: ["SUMMARY"], includedSensitiveCategories: [], pregnancyExcluded: false, durationDays: 30 });
    expect(durationAttack.status).toBe(422);
    expect(durationAttack.body.error.code).toBe("RECORD_SHARE_DURATION_EXCEEDS_REQUEST");
  });

  it("decide sin verificar el OTP primero falla (403)", async () => {
    const { token } = await createPendingRequest();
    const decide = await request(app.getHttpServer())
      .post(`/record-share/authorize/${token}/decide`)
      .send({ decision: "APPROVED", approvedScope: ["SUMMARY"], includedSensitiveCategories: [], pregnancyExcluded: false, durationDays: 7 });
    expect(decide.status).toBe(403);
    expect(decide.body.error.code).toBe("RECORD_SHARE_OTP_NOT_VERIFIED");
  });

  it("un OTP ya usado no se reutiliza", async () => {
    const { token } = await createPendingRequest();
    const code = await sendAndGetOtp(token);
    const first = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code });
    expect(first.status).toBe(200);
    const second = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("RECORD_SHARE_OTP_INVALID");
  });

  it("un OTP vencido falla", async () => {
    const { token, requestRow } = await createPendingRequest();
    await sendAndGetOtp(token);
    await prisma.recordShareChallenge.updateMany({ where: { requestId: requestRow.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const verify = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code: "000000" });
    expect(verify.status).toBe(400);
    expect(verify.body.error.code).toBe("RECORD_SHARE_OTP_INVALID");
  });

  it("5 intentos fallidos bloquean por 1h, y queda en audit_log", async () => {
    const { token, requestRow } = await createPendingRequest();
    await sendAndGetOtp(token);

    for (let i = 0; i < 4; i += 1) {
      const attempt = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code: "000000" });
      expect(attempt.status).toBe(400);
    }
    const fifth = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code: "000000" });
    expect(fifth.status).toBe(400);

    const challenge = await prisma.recordShareChallenge.findFirstOrThrow({ where: { requestId: requestRow.id } });
    expect(challenge.attempts).toBe(5);
    expect(challenge.lockedUntil).not.toBeNull();

    const sixth = await request(app.getHttpServer()).post(`/record-share/authorize/${token}/otp/verify`).send({ code: "123456" });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RECORD_SHARE_OTP_LOCKED");

    const lockedLog = await prisma.auditLog.findFirst({ where: { action: "SHARE_OTP_LOCKED", resourceId: requestRow.id } });
    expect(lockedLog).not.toBeNull();
  });
});
