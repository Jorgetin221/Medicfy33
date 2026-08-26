import { randomUUID } from "node:crypto";
import type { INestApplication, ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "./services/notification.port";
import { AuthService } from "./services/auth.service";
import { DoctorVerifiedGuard } from "./guards/doctor-verified.guard";
import { ApiException } from "../../common/api-exception";

class TestNotificationAdapter implements NotificationPort {
  public readonly emailCodes = new Map<string, string>();
  public readonly phoneCodes = new Map<string, string>();
  public readonly resetLinks = new Map<string, string>();
  public readonly invitations = new Map<string, string>();

  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.emailCodes.set(to, code);
  }
  async sendPhoneVerificationCode(to: string, code: string): Promise<void> {
    this.phoneCodes.set(to, code);
  }
  async sendPasswordResetLink(to: string, url: string): Promise<void> {
    this.resetLinks.set(to, url);
  }
  async sendAssistantInvitation(to: string, url: string): Promise<void> {
    this.invitations.set(to, url);
  }
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}

function uniquePhone(): string {
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Expected map to contain key ${String(key)}`);
  }
  return value;
}

function uniqueCedula(): string {
  return Math.floor(1000000 + Math.random() * 8999999).toString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

describe("M1 — Identidad, cuentas y sesión", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: TestNotificationAdapter;

  beforeAll(async () => {
    const notificationAdapter = new TestNotificationAdapter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notificationAdapter)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    notifications = notificationAdapter;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndVerifyPatient(overrides?: {
    privacyNotice?: boolean;
    sensitiveData?: boolean;
  }): Promise<{ userId: string; email: string }> {
    const email = uniqueEmail("patient");
    const res = await request(app.getHttpServer())
      .post("/auth/register/patient")
      .send({
        email,
        password: STRONG_PASSWORD,
        phone: uniquePhone(),
        consents: {
          privacyNotice: overrides?.privacyNotice ?? true,
          sensitiveData: overrides?.sensitiveData ?? true,
          digitalPrescriptionChannel: false,
        },
      });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const code = mustGet(notifications.emailCodes, email);
    const verifyRes = await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    expect(verifyRes.status).toBe(200);
    return { userId, email };
  }

  async function registerAndVerifyDoctor(): Promise<{ userId: string; email: string }> {
    const email = uniqueEmail("doctor");
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email,
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const code = mustGet(notifications.emailCodes, email);
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    return { userId, email };
  }

  describe("M1-CA-001 — consentimiento explícito, sin default implícito", () => {
    it("registers a patient when privacyNotice and sensitiveData are explicitly true", async () => {
      const { userId } = await registerAndVerifyPatient();
      expect(userId).toBeTruthy();
    });

    it("rejects registration when privacyNotice is false (no implicit grant possible)", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/register/patient")
        .send({
          email: uniqueEmail("patient"),
          password: STRONG_PASSWORD,
          phone: uniquePhone(),
          consents: { privacyNotice: false, sensitiveData: true, digitalPrescriptionChannel: false },
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects registration when the consents object is omitted entirely", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/register/patient")
        .send({ email: uniqueEmail("patient"), password: STRONG_PASSWORD, phone: uniquePhone() });
      expect(res.status).toBe(400);
    });
  });

  describe("M1-CA-002 — una fila en consents por cada casilla, con versión e IP", () => {
    it("creates one consents row per checkbox with documentVersion and ipAddress recorded", async () => {
      const { userId } = await registerAndVerifyPatient();
      const rows = await prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

      expect(rows).toHaveLength(3);
      const privacyNotice = rows.find((r) => r.consentType === "PRIVACY_NOTICE");
      const sensitiveData = rows.find((r) => r.consentType === "SENSITIVE_DATA");
      const digitalPrescription = rows.find((r) => r.consentType === "DIGITAL_PRESCRIPTION_CHANNEL");

      expect(privacyNotice?.granted).toBe(true);
      expect(sensitiveData?.granted).toBe(true);
      expect(digitalPrescription?.granted).toBe(false);

      for (const row of rows) {
        expect(row.documentVersion).toBeTruthy();
        expect(row.ipAddress).toBeTruthy();
        expect(row.evidenceHash).toHaveLength(64); // sha256 hex
      }
    });
  });

  describe("M1-CA-003 — DOCTOR_NOT_VERIFIED antes de estar verificado", () => {
    it("blocks a clinical action for a doctor still in SUBMITTED status", async () => {
      const { userId } = await registerAndVerifyDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(doctor.verificationStatus).toBe("SUBMITTED");

      const authService = app.get(AuthService);
      const guard = new DoctorVerifiedGuard(authService);
      const fakeContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId } }) }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(fakeContext)).rejects.toMatchObject({
        code: "DOCTOR_NOT_VERIFIED",
      } satisfies Partial<ApiException>);
    });

    it("allows the clinical action once verificationStatus is VERIFIED", async () => {
      const { userId } = await registerAndVerifyDoctor();
      await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });

      const authService = app.get(AuthService);
      const guard = new DoctorVerifiedGuard(authService);
      const fakeContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId } }) }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(fakeContext)).resolves.toBe(true);
    });
  });

  describe("M1-CA-004 — bloqueo tras 5 intentos fallidos, registrado en audit_log", () => {
    it("locks the account on the 5th failed attempt and logs it", async () => {
      const { userId, email } = await registerAndVerifyPatient();

      const attempts = [];
      for (let attempt = 1; attempt <= 5; attempt++) {
        attempts.push(
          await request(app.getHttpServer())
            .post("/auth/login")
            .send({ email, password: "wrong-password-entirely" })
        );
      }
      const lastRes = attempts.at(-1);
      if (!lastRes) {
        throw new Error("login loop did not execute");
      }

      expect(lastRes.status).toBe(423);
      expect(lastRes.body.error.code).toBe("AUTH_ACCOUNT_LOCKED");
      expect(lastRes.body.error.details.retry_after).toBeTruthy();

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.lockedUntil) {
        throw new Error("expected lockedUntil to be set");
      }
      expect(user.lockedUntil.getTime()).toBeGreaterThan(Date.now());

      const lockEntry = await prisma.auditLog.findFirst({
        where: { actorUserId: userId, action: "auth.account_locked", result: "DENIED" },
        orderBy: { occurredAt: "desc" },
      });
      expect(lockEntry).not.toBeNull();

      // Even while locked, correct credentials are still rejected with
      // AUTH_ACCOUNT_LOCKED (not silently let through).
      const stillLocked = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: STRONG_PASSWORD });
      expect(stillLocked.status).toBe(423);
    });
  });

  describe("M1-CA-005 — MFA obligatorio a partir de la 4ª sesión sin enrolar", () => {
    it("allows the first 3 doctor logins without MFA, then blocks the 4th", async () => {
      const { email } = await registerAndVerifyDoctor();

      for (let session = 1; session <= 3; session++) {
        const res = await request(app.getHttpServer())
          .post("/auth/login")
          .send({ email, password: STRONG_PASSWORD });
        expect(res.status, `session ${session} should succeed without MFA`).toBe(200);
        expect(res.body.accessToken).toBeTruthy();
      }

      const fourth = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: STRONG_PASSWORD });
      expect(fourth.status).toBe(428);
      expect(fourth.body.error.code).toBe("AUTH_MFA_REQUIRED");
      expect(fourth.body.error.details.enrollment_required).toBe(true);
    });
  });

  describe("M1-CA-006 — cierre de sesión de médico por inactividad a los 30 min", () => {
    it("rejects a refresh once the doctor session has been idle past 30 minutes", async () => {
      const { userId, email } = await registerAndVerifyDoctor();
      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: STRONG_PASSWORD });
      expect(loginRes.status).toBe(200);

      const setCookie = loginRes.headers["set-cookie"] as unknown as string[];
      const refreshCookie = setCookie.find((c) => c.startsWith("medicfy_refresh_token="));
      if (!refreshCookie) {
        throw new Error("expected a medicfy_refresh_token cookie to be set on login");
      }

      // Simulate 31 minutes of inactivity directly at the data layer —
      // waiting 31 real minutes in a test would be absurd. Scoped to
      // this test's own user only.
      await prisma.session.updateMany({
        where: { userId },
        data: { lastUsedAt: new Date(Date.now() - 31 * 60 * 1000) },
      });

      const refreshRes = await request(app.getHttpServer())
        .post("/auth/refresh")
        .set("Cookie", refreshCookie);

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.error.details.reason).toBe("idle_timeout");
    });

    it.todo(
      "the 28-minute in-app warning banner is a DOC-06 frontend concern (apps/web), not verifiable from an API integration test"
    );
  });

  // DT-03: POST /doctors/me/assistants/accept was previously unreachable
  // through the API — AssistantInvitationService.accept() existed and
  // worked, but no controller route called it, so nothing here had ever
  // been tested against a real request either.
  describe("M1-RN-008 — invitación y aceptación de asistente", () => {
    async function loginFor(email: string): Promise<string> {
      const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password: STRONG_PASSWORD });
      expect(res.status).toBe(200);
      return res.body.accessToken as string;
    }

    it("accepts a valid invitation, granting UserRole(ASSISTANT) scoped to the inviting doctor", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorAccessToken = await loginFor(doctor.email);
      const assistant = await registerAndVerifyPatient();
      const assistantAccessToken = await loginFor(assistant.email);

      const invite = await request(app.getHttpServer())
        .post("/doctors/me/assistants/invite")
        .set("Authorization", `Bearer ${doctorAccessToken}`)
        .send({ email: assistant.email });
      expect(invite.status).toBe(200);

      const invitationUrl = mustGet(notifications.invitations, assistant.email);
      const token = new URL(invitationUrl).searchParams.get("token");
      if (!token) {
        throw new Error("expected the invitation URL to carry a token query param");
      }

      const accept = await request(app.getHttpServer())
        .post("/doctors/me/assistants/accept")
        .set("Authorization", `Bearer ${assistantAccessToken}`)
        .send({ token });
      expect(accept.status).toBe(200);
      expect(accept.body.accepted).toBe(true);

      const role = await prisma.userRole.findFirst({ where: { userId: assistant.userId, role: "ASSISTANT" } });
      expect(role?.scopeId).toBe(doctor.userId);
    });

    it("rejects an unknown token (400)", async () => {
      const assistant = await registerAndVerifyPatient();
      const assistantAccessToken = await loginFor(assistant.email);

      const res = await request(app.getHttpServer())
        .post("/doctors/me/assistants/accept")
        .set("Authorization", `Bearer ${assistantAccessToken}`)
        .send({ token: "not-a-real-token" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ASSISTANT_INVITATION_INVALID");
    });

    it("rejects reusing an already-accepted token (400)", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorAccessToken = await loginFor(doctor.email);
      const assistant = await registerAndVerifyPatient();
      const assistantAccessToken = await loginFor(assistant.email);

      const invite = await request(app.getHttpServer())
        .post("/doctors/me/assistants/invite")
        .set("Authorization", `Bearer ${doctorAccessToken}`)
        .send({ email: assistant.email });
      expect(invite.status).toBe(200);
      const invitationUrl = mustGet(notifications.invitations, assistant.email);
      const token = new URL(invitationUrl).searchParams.get("token");
      if (!token) {
        throw new Error("expected the invitation URL to carry a token query param");
      }

      const firstAccept = await request(app.getHttpServer())
        .post("/doctors/me/assistants/accept")
        .set("Authorization", `Bearer ${assistantAccessToken}`)
        .send({ token });
      expect(firstAccept.status).toBe(200);

      const secondAccept = await request(app.getHttpServer())
        .post("/doctors/me/assistants/accept")
        .set("Authorization", `Bearer ${assistantAccessToken}`)
        .send({ token });
      expect(secondAccept.status).toBe(400);
      expect(secondAccept.body.error.code).toBe("ASSISTANT_INVITATION_INVALID");
    });

    it("DOC-16: GET /doctors/me/assistants lists pending and accepted separately, scoped to the caller, DOCTOR-only", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorAccessToken = await loginFor(doctor.email);
      const otherDoctor = await registerAndVerifyDoctor();
      const otherDoctorAccessToken = await loginFor(otherDoctor.email);
      const pendingAssistantEmail = uniqueEmail("pending-assistant");
      const acceptedAssistant = await registerAndVerifyPatient();
      const acceptedAssistantAccessToken = await loginFor(acceptedAssistant.email);

      await request(app.getHttpServer())
        .post("/doctors/me/assistants/invite")
        .set("Authorization", `Bearer ${doctorAccessToken}`)
        .send({ email: pendingAssistantEmail });

      const invite = await request(app.getHttpServer())
        .post("/doctors/me/assistants/invite")
        .set("Authorization", `Bearer ${doctorAccessToken}`)
        .send({ email: acceptedAssistant.email });
      expect(invite.status).toBe(200);
      const invitationUrl = mustGet(notifications.invitations, acceptedAssistant.email);
      const token = new URL(invitationUrl).searchParams.get("token");
      if (!token) {
        throw new Error("expected the invitation URL to carry a token query param");
      }
      await request(app.getHttpServer())
        .post("/doctors/me/assistants/accept")
        .set("Authorization", `Bearer ${acceptedAssistantAccessToken}`)
        .send({ token });

      const list = await request(app.getHttpServer())
        .get("/doctors/me/assistants")
        .set("Authorization", `Bearer ${doctorAccessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.pending).toHaveLength(1);
      expect(list.body.pending[0].email).toBe(pendingAssistantEmail);
      expect(list.body.accepted).toHaveLength(1);
      expect(list.body.accepted[0].email).toBe(acceptedAssistant.email);

      const otherDoctorList = await request(app.getHttpServer())
        .get("/doctors/me/assistants")
        .set("Authorization", `Bearer ${otherDoctorAccessToken}`);
      expect(otherDoctorList.status).toBe(200);
      expect(otherDoctorList.body.pending).toHaveLength(0);
      expect(otherDoctorList.body.accepted).toHaveLength(0);

      const asAssistant = await request(app.getHttpServer())
        .get("/doctors/me/assistants")
        .set("Authorization", `Bearer ${acceptedAssistantAccessToken}`);
      expect(asAssistant.status).toBe(403);
    });
  });
});
