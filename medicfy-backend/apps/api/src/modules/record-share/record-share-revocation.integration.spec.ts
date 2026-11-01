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
import { TokenService } from "../identity/services/token.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "./record-share-notification.port";
import { sha256Hex } from "./record-share-crypto.util";
import { RecordShareSweepService } from "./services/record-share-sweep.service";

/**
 * PR-EXP-06 — notificaciones, revocación, caducidad y supervisión.
 * Criterio de terminación: revocar bloquea de inmediato (el siguiente
 * GET del visor ya da 403), el OTP de autorización NO sirve para
 * revocar (propósitos separados), un paciente no revoca grants de
 * otro, el barrido vence solicitudes/grants y avisa, ningún aviso a
 * médicos lleva el nombre del paciente (RE9), el custodio ve el
 * historial y reporta abuso, y solo un admin suspende.
 */
class RecordingNotificationAdapter implements RecordShareNotificationPort {
  public otpCodes: string[] = [];
  public revocationUrls: string[] = [];
  public revocationNotices = 0;
  async sendAuthorizationRequest(): Promise<void> {}
  async sendOtpCode(input: { code: string }): Promise<void> {
    this.otpCodes.push(input.code);
  }
  async sendApprovalConfirmation(input: { revocationUrl: string }): Promise<void> {
    this.revocationUrls.push(input.revocationUrl);
  }
  async sendRevocationNotice(): Promise<void> {
    this.revocationNotices += 1;
  }
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const PATIENT_FIRST_NAME = "Rosaura";

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

describe("Expediente compartido — PR-EXP-06 (revocación, caducidad, supervisión)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let careRelationshipService: CareRelationshipService;
  let tokenService: TokenService;
  let sweep: RecordShareSweepService;
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
    tokenService = moduleRef.get(TokenService);
    sweep = moduleRef.get(RecordShareSweepService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerVerifiedDoctor(legalFirstName: string) {
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
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, doctorId: doctor.id, accessToken };
  }

  async function createAdminToken(): Promise<string> {
    const admin = await prisma.user.create({
      data: { email: uniqueEmail("admin"), passwordHash: "x", primaryRole: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    await prisma.userRole.create({ data: { userId: admin.id, role: "ADMIN" } });
    return tokenService.signAccessToken({ sub: admin.id, primaryRole: "ADMIN" });
  }

  // Flujo real de PR-EXP-03 hasta APPROVED — devuelve el token de
  // revocación que viajó en la confirmación al paciente.
  async function approvedShare() {
    const requester = await registerVerifiedDoctor("Solicitante");
    const custodian = await registerVerifiedDoctor("Custodio");
    const patient = await prisma.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: PATIENT_FIRST_NAME,
        lastNamePaternal: "Peña",
        birthDate: new Date("1990-03-15"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        source: "CREATED_BY_DOCTOR",
      },
    });
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");
    const authToken = randomUUID();
    const shareRequest = await prisma.recordShareRequest.create({
      data: {
        requesterDoctorId: requester.doctorId,
        custodianDoctorId: custodian.doctorId,
        patientId: patient.id,
        reason: "Valoración por dolor torácico y antecedentes",
        requestedScope: ["SUMMARY"],
        requestedDurationDays: 30,
        linkTokenHash: sha256Hex(authToken),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    notifications.otpCodes = [];
    await request(app.getHttpServer()).post(`/record-share/authorize/${authToken}/otp`).expect(200);
    const code = notifications.otpCodes.at(-1);
    await request(app.getHttpServer()).post(`/record-share/authorize/${authToken}/otp/verify`).send({ code }).expect(200);
    await request(app.getHttpServer())
      .post(`/record-share/authorize/${authToken}/decide`)
      .send({ decision: "APPROVED", approvedScope: ["SUMMARY"], includedSensitiveCategories: [], pregnancyExcluded: false, durationDays: 7 })
      .expect(200);

    const revocationUrl = notifications.revocationUrls.at(-1) ?? "";
    const revokeToken = revocationUrl.split("/").at(-1) ?? "";
    const consent = await prisma.recordShareConsent.findUniqueOrThrow({ where: { requestId: shareRequest.id } });
    const grant = await prisma.recordShareGrant.findUniqueOrThrow({ where: { consentId: consent.id } });
    return { requester, custodian, patient, shareRequest, grant, revokeToken, revocationUrl };
  }

  async function verifyRevokeOtp(revokeToken: string) {
    notifications.otpCodes = [];
    await request(app.getHttpServer()).post(`/record-share/revoke/${revokeToken}/otp`).expect(200);
    const code = notifications.otpCodes.at(-1);
    await request(app.getHttpServer()).post(`/record-share/revoke/${revokeToken}/otp/verify`).send({ code }).expect(200);
  }

  it("la confirmación lleva un enlace de revocación cuyo hash (no el token) es el que está en la base", async () => {
    const { grant, revokeToken, revocationUrl } = await approvedShare();
    expect(revocationUrl).toMatch(/\/expediente-compartido\/revocar\/[A-Za-z0-9_-]{40,}$/);
    expect(grant.revokeTokenHash).toBe(sha256Hex(revokeToken));
    expect(grant.revokeTokenHash).not.toBe(revokeToken);
  });

  it("aprobar avisa al solicitante y al custodio — sin el nombre del paciente en ningún aviso (RE9)", async () => {
    const { requester, custodian, grant } = await approvedShare();
    const rows = await prisma.notification.findMany({ where: { relatedEntityId: grant.id } });
    expect(rows.map((r) => [r.userId, r.templateCode]).sort()).toEqual(
      [
        [custodian.userId, "RECORD_SHARE_CUSTODIAN_NOTICE"],
        [requester.userId, "RECORD_SHARE_APPROVED"],
      ].sort()
    );
    for (const row of rows) {
      expect(JSON.stringify(row.templateData)).not.toContain(PATIENT_FIRST_NAME);
    }
  });

  it("revocar exige OTP de revocación (el de autorización no sirve) y bloquea el visor de inmediato", async () => {
    const { requester, grant, revokeToken } = await approvedShare();

    const before = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(before.status).toBe(200);

    const info = await request(app.getHttpServer()).get(`/record-share/revoke/${revokeToken}`);
    expect(info.status).toBe(200);
    expect(info.body.activeGrants).toEqual([expect.objectContaining({ grantId: grant.id, isLinkGrant: true })]);
    expect(JSON.stringify(info.body)).not.toContain(PATIENT_FIRST_NAME);

    // Solo hay un challenge AUTHORIZE ya consumido — no cuenta para revocar.
    const noOtp = await request(app.getHttpServer()).post(`/record-share/revoke/${revokeToken}/revoke`).send({ grantId: grant.id });
    expect(noOtp.status).toBe(403);
    expect(noOtp.body.error.code).toBe("RECORD_SHARE_OTP_NOT_VERIFIED");

    await verifyRevokeOtp(revokeToken);
    const revoked = await request(app.getHttpServer()).post(`/record-share/revoke/${revokeToken}/revoke`).send({ grantId: grant.id });
    expect(revoked.status).toBe(200);

    const after = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(after.status).toBe(403);

    const row = await prisma.recordShareGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(row.status).toBe("REVOKED_BY_PATIENT");
    expect(row.revokedAt).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_REVOKED", resourceId: grant.id } })).not.toBeNull();
    expect(await prisma.notification.findFirst({ where: { relatedEntityId: grant.id, templateCode: "RECORD_SHARE_REVOKED" } })).not.toBeNull();
    expect(notifications.revocationNotices).toBeGreaterThan(0);
  });

  it("un enlace de revocación no revoca grants de OTRO paciente", async () => {
    const mine = await approvedShare();
    const other = await approvedShare();
    await verifyRevokeOtp(mine.revokeToken);
    const res = await request(app.getHttpServer()).post(`/record-share/revoke/${mine.revokeToken}/revoke`).send({ grantId: other.grant.id });
    expect(res.status).toBe(404);
    const untouched = await prisma.recordShareGrant.findUniqueOrThrow({ where: { id: other.grant.id } });
    expect(untouched.status).toBe("ACTIVE");
  });

  it("un token de revocación inventado falla genérico", async () => {
    const res = await request(app.getHttpServer()).get(`/record-share/revoke/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RECORD_SHARE_LINK_INVALID");
  });

  it("el barrido vence grants y solicitudes sin respuesta, audita y avisa con la plantilla neutra (RE5)", async () => {
    const { grant } = await approvedShare();
    await prisma.recordShareGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const { shareRequest: pending } = await approvedShare();
    // Una solicitud PENDING nueva, ya vencida.
    const stale = await prisma.recordShareRequest.create({
      data: {
        requesterDoctorId: pending.requesterDoctorId,
        custodianDoctorId: pending.custodianDoctorId,
        patientId: pending.patientId,
        reason: "Valoración por dolor torácico y antecedentes",
        requestedScope: ["SUMMARY"],
        requestedDurationDays: 30,
        linkTokenHash: sha256Hex(randomUUID()),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await sweep.sweep();

    expect((await prisma.recordShareGrant.findUniqueOrThrow({ where: { id: grant.id } })).status).toBe("EXPIRED");
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_GRANT_EXPIRED", resourceId: grant.id } })).not.toBeNull();
    expect((await prisma.recordShareRequest.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED_UNANSWERED");
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_REQUEST_EXPIRED", resourceId: stale.id } })).not.toBeNull();
    expect(await prisma.notification.findFirst({ where: { relatedEntityId: stale.id, templateCode: "RECORD_SHARE_NOT_AUTHORIZED" } })).not.toBeNull();
  });

  it("el aviso 'por vencer' se manda una sola vez aunque el barrido pase varias veces", async () => {
    const { grant } = await approvedShare();
    await prisma.recordShareGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    await sweep.sweep();
    await sweep.sweep();
    const rows = await prisma.notification.findMany({ where: { relatedEntityId: grant.id, templateCode: "RECORD_SHARE_EXPIRING" } });
    expect(rows).toHaveLength(1);
  });

  it("el custodio ve quién tiene acceso y cuándo lo consultó; otro médico sin vínculo recibe 403", async () => {
    const { requester, custodian, patient, grant } = await approvedShare();
    await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`).expect(200);

    const res = await request(app.getHttpServer()).get(`/record-share/patients/${patient.id}/shares`).set("Authorization", `Bearer ${custodian.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: grant.id, status: "ACTIVE", abuseReported: false })]);
    expect(res.body[0].views.length).toBeGreaterThan(0);

    const outsider = await registerVerifiedDoctor("Ajeno");
    const denied = await request(app.getHttpServer()).get(`/record-share/patients/${patient.id}/shares`).set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(denied.status).toBe(403);
  });

  it("reporte de abuso → cola del admin → suspensión bloquea el visor; un médico no puede suspender", async () => {
    const { requester, custodian, patient, grant } = await approvedShare();
    const report = await request(app.getHttpServer())
      .post(`/record-share/patients/${patient.id}/grants/${grant.id}/report-abuse`)
      .set("Authorization", `Bearer ${custodian.accessToken}`)
      .send({ reason: "Consultas fuera de horario sin cita vinculada con el paciente" });
    expect(report.status).toBe(200);

    const adminToken = await createAdminToken();
    const queue = await request(app.getHttpServer()).get("/admin/record-share/abuse-reports").set("Authorization", `Bearer ${adminToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body).toEqual(expect.arrayContaining([expect.objectContaining({ grantId: grant.id, grantStatus: "ACTIVE" })]));
    // R4: el admin solo ve metadatos.
    expect(JSON.stringify(queue.body)).not.toContain(PATIENT_FIRST_NAME);

    const asDoctor = await request(app.getHttpServer())
      .post(`/admin/record-share/grants/${grant.id}/suspend`)
      .set("Authorization", `Bearer ${custodian.accessToken}`)
      .send({ reason: "Suspensión preventiva por reporte de abuso" });
    expect(asDoctor.status).toBe(403);

    const shortReason = await request(app.getHttpServer())
      .post(`/admin/record-share/grants/${grant.id}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "corto" });
    expect(shortReason.status).toBe(400);

    const suspended = await request(app.getHttpServer())
      .post(`/admin/record-share/grants/${grant.id}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Suspensión preventiva por reporte de abuso" });
    expect(suspended.status).toBe(200);

    const viewer = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(viewer.status).toBe(403);
    const audit = await prisma.auditLog.findFirst({ where: { action: "SHARE_SUSPENDED_BY_ADMIN", resourceId: grant.id } });
    expect(audit?.justification).toBe("Suspensión preventiva por reporte de abuso");
  });
});
