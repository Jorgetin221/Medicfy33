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
import { PasswordService } from "../identity/services/password.service";
import { AppointmentStateMachineService } from "../scheduling/services/appointment-state-machine.service";
import { toPublicDoctorView } from "./doctor-public-view";

class TestNotificationAdapter implements NotificationPort {
  public readonly emailCodes = new Map<string, string>();
  public readonly suspensionCancellations: { to: string; appointmentStartsAt: Date; refundPercent: number }[] = [];
  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.emailCodes.set(to, code);
  }
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(to: string, details: { appointmentStartsAt: Date; refundPercent: number }): Promise<void> {
    this.suspensionCancellations.push({ to, ...details });
  }
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

describe("M2 — Perfil médico y verificación", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let passwordService: PasswordService;
  let appointmentService: AppointmentStateMachineService;
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
    tokenService = moduleRef.get(TokenService);
    passwordService = moduleRef.get(PasswordService);
    appointmentService = moduleRef.get(AppointmentStateMachineService);
    notifications = notificationAdapter;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndVerifyDoctor(): Promise<{ userId: string; email: string; accessToken: string }> {
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
    const code = notifications.emailCodes.get(email);
    if (!code) {
      throw new Error("expected an email verification code to have been issued");
    }
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, email, accessToken };
  }

  async function createAdmin(): Promise<{ userId: string; accessToken: string }> {
    const passwordHash = await passwordService.hash(STRONG_PASSWORD);
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail("admin"),
        passwordHash,
        primaryRole: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, role: "ADMIN" } });
    const accessToken = tokenService.signAccessToken({ sub: admin.id, primaryRole: "ADMIN" });
    return { userId: admin.id, accessToken };
  }

  describe("M2-CA-001 — el precio nunca sale en una respuesta pública", () => {
    it("toPublicDoctorView's return type carries no price field at all", async () => {
      const { userId } = await registerAndVerifyDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      const view = toPublicDoctorView(doctor, null);
      expect(Object.keys(view)).not.toContain("priceMxnCents");
      expect(Object.keys(view)).not.toContain("price");
      expect(JSON.stringify(view)).not.toMatch(/price/i);
    });

    it("rejects unauthenticated access to the (private) services/pricing endpoint entirely", async () => {
      const res = await request(app.getHttpServer()).get("/doctors/me/services");
      expect(res.status).toBe(401);
    });

    it("the owner's private endpoint does carry the price (proving it's tracked, just never public)", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/services")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ serviceType: "FIRST_VISIT", name: "Consulta general", durationMinutes: 30, priceMxn: 799 });
      expect(create.status).toBe(201);
      expect(create.body.priceMxnCents).toBe(79_900);

      const list = await request(app.getHttpServer())
        .get("/doctors/me/services")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(list.status).toBe(200);
      expect(list.body[0].priceMxnCents).toBe(79_900);
    });
  });

  describe("M2-CA-002 — cédula inmutable tras verificación", () => {
    it("blocks an attempt to change legalFirstName once VERIFIED, returns 403, and audits it", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      const admin = await createAdmin();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      const verifyRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/verify`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(verifyRes.status).toBe(200);

      const patchRes = await request(app.getHttpServer())
        .patch("/doctors/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ legalFirstName: "Hackeado" });

      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe("DOCTOR_FIELD_IMMUTABLE");

      const stillOriginal = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(stillOriginal.legalFirstName).toBe("Ana");

      const denyEntry = await prisma.auditLog.findFirst({
        where: { actorUserId: userId, action: "doctor.profile.immutable_field_change_denied", result: "DENIED" },
        orderBy: { occurredAt: "desc" },
      });
      expect(denyEntry).not.toBeNull();
    });

    // v2.1 addendum (§17): correcting a legal field while SUBMITTED is
    // now a real, built path — it reverts the record to DRAFT so an
    // admin never reviews against data that changed mid-review.
    it("allows correcting legalFirstName while SUBMITTED, and reverts status to DRAFT", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      const doctorBefore = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(doctorBefore.verificationStatus).toBe("SUBMITTED");

      const patchRes = await request(app.getHttpServer())
        .patch("/doctors/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ legalFirstName: "Corregido" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.legalFirstName).toBe("Corregido");
      expect(patchRes.body.verificationStatus).toBe("DRAFT");

      const updated = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(updated.legalFirstName).toBe("Corregido");
      expect(updated.verificationStatus).toBe("DRAFT");

      const correctionEntry = await prisma.auditLog.findFirst({
        where: {
          actorUserId: userId,
          action: "doctor.profile.legal_field_corrected_reverted_to_draft",
          result: "SUCCESS",
        },
      });
      expect(correctionEntry).not.toBeNull();
    });

    // Aclaración post-v2.1 (§17): a rejected doctor gets an email asking
    // them to fix their application, and the most common rejection
    // reason is a misentered legal field — REJECTED must stay on the
    // correction path (same revert-to-DRAFT behavior as SUBMITTED),
    // otherwise the rejection flow has no way out.
    it("allows correcting legalFirstName while REJECTED, and reverts status to DRAFT", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "REJECTED" } });

      const patchRes = await request(app.getHttpServer())
        .patch("/doctors/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ legalFirstName: "Corregido" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.legalFirstName).toBe("Corregido");
      expect(patchRes.body.verificationStatus).toBe("DRAFT");

      const updated = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(updated.legalFirstName).toBe("Corregido");
      expect(updated.verificationStatus).toBe("DRAFT");

      const correctionEntry = await prisma.auditLog.findFirst({
        where: {
          actorUserId: userId,
          action: "doctor.profile.legal_field_corrected_reverted_to_draft",
          result: "SUCCESS",
        },
      });
      expect(correctionEntry).not.toBeNull();
    });

    it("allows correcting a legal field while already DRAFT, without an unnecessary status transition", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "DRAFT" } });

      const patchRes = await request(app.getHttpServer())
        .patch("/doctors/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ legalLastName: "Corregido" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.verificationStatus).toBe("DRAFT");

      const correctionEntry = await prisma.auditLog.findFirst({
        where: { actorUserId: userId, action: "doctor.profile.legal_field_corrected", result: "SUCCESS" },
      });
      expect(correctionEntry).not.toBeNull();
    });

    it("rejects the correction path with a duplicate professionalLicense (409), matching registration's own check", async () => {
      const other = await registerAndVerifyDoctor();
      const { accessToken } = await registerAndVerifyDoctor();
      const otherDoctor = await prisma.doctor.findUniqueOrThrow({ where: { userId: other.userId } });

      const patchRes = await request(app.getHttpServer())
        .patch("/doctors/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ professionalLicense: otherDoctor.professionalLicense });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body.error.code).toBe("CEDULA_ALREADY_REGISTERED");
    });

    // Aclaración post-v2.1 (§17): only IN_REVIEW/VERIFIED/SUSPENDED
    // block the correction path. REJECTED was moved to the allowed
    // list (see the test above) — a rejected doctor needs an edit
    // path, since that's exactly what the rejection email asks for.
    it.each(["IN_REVIEW", "SUSPENDED"] as const)(
      "blocks the correction path when status is %s",
      async (status) => {
        const { userId, accessToken } = await registerAndVerifyDoctor();
        await prisma.doctor.update({ where: { userId }, data: { verificationStatus: status } });

        const patchRes = await request(app.getHttpServer())
          .patch("/doctors/me")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ legalFirstName: "Intento" });

        expect(patchRes.status).toBe(403);
        expect(patchRes.body.error.code).toBe("DOCTOR_FIELD_IMMUTABLE");
      }
    );
  });

  describe("M2-CA-003 — cola de administración con documentos y hash", () => {
    it("lists a submitted doctor's uploaded documents with their hash, and requires a reason to reject", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });

      const upload = await request(app.getHttpServer())
        .post("/doctors/me/documents?docType=CEDULA_PROFESIONAL")
        .set("Authorization", `Bearer ${accessToken}`)
        .attach("file", Buffer.from("%PDF-1.4 fake cedula content"), {
          filename: "cedula.pdf",
          contentType: "application/pdf",
        });
      expect(upload.status).toBe(201);
      expect(upload.body.fileHashSha256).toHaveLength(64);

      const admin = await createAdmin();
      const queue = await request(app.getHttpServer())
        .get("/admin/doctors?verification_status=SUBMITTED")
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(queue.status).toBe(200);
      const found = queue.body.find((d: { id: string }) => d.id === doctor.id);
      expect(found).toBeDefined();
      expect(found.documents[0].fileHashSha256).toBe(upload.body.fileHashSha256);

      const rejectNoReason = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/reject`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({});
      expect(rejectNoReason.status).toBe(400);

      const rejectWithReason = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/reject`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ reason: "El documento de cédula es ilegible, favor de resubir." });
      expect(rejectWithReason.status).toBe(200);
      expect(rejectWithReason.body.verificationStatus).toBe("REJECTED");
    });

    it("rejects a non-admin caller with 403", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const res = await request(app.getHttpServer())
        .get("/admin/doctors")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("M2-CA-004 — suspensión: transición de estado y notificación", () => {
    it("suspends a verified doctor and audits the effects hook result", async () => {
      const { userId } = await registerAndVerifyDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      const admin = await createAdmin();

      const suspendRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/suspend`)
        .set("Authorization", `Bearer ${admin.accessToken}`);

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.doctor.verificationStatus).toBe("SUSPENDED");

      const updated = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(updated.verificationStatus).toBe("SUSPENDED");

      const auditEntry = await prisma.auditLog.findFirst({
        where: { action: "doctor.suspend", resourceId: doctor.id, result: "SUCCESS" },
      });
      expect(auditEntry).not.toBeNull();
    });

    it("cancels the doctor's future paid appointments, notifies each patient with their 100% refund entitlement, and reports the real counts", async () => {
      const doctor = await registerAndVerifyDoctor();
      // M2-RN-004: sin esto no podría agendar — no es lo que este test
      // verifica.
      await prisma.doctor.update({ where: { userId: doctor.userId }, data: { acceptsTeleconsultation: true } });

      const serviceRes = await request(app.getHttpServer())
        .post("/doctors/me/services")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
      expect(serviceRes.status).toBe(201);

      const patientEmail = uniqueEmail("patient");
      const patientRes = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "Karla",
          lastNamePaternal: "Núñez",
          birthDate: "1988-02-10",
          sexAtBirth: "F",
          phoneE164: uniquePhone(),
          email: patientEmail,
        });
      expect(patientRes.status).toBe(201);

      const apptRes = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          patientId: patientRes.body.id,
          serviceId: serviceRes.body.id,
          startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(apptRes.status).toBe(201);
      expect(apptRes.body.status).toBe("PENDING_PAYMENT");
      // Solo citas pagadas (SCHEDULED/CONFIRMED) admiten
      // CANCELLED_BY_DOCTOR en la máquina de estados — confirmar el
      // pago es lo que las vuelve elegibles para este flujo.
      await appointmentService.confirmPayment(apptRes.body.id, doctor.userId);

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const admin = await createAdmin();
      const suspendRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctorRecord.id}/suspend`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.notifiedPatients).toBe(1);
      // El reembolso real (dinero) sigue diferido — no hay pasarela de
      // pago (M6). Ver CRITERIOS_DIFERIDOS.md, M2-CA-004.
      expect(suspendRes.body.refundsIssued).toBe(0);

      const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: apptRes.body.id } });
      expect(cancelled.status).toBe("CANCELLED_BY_DOCTOR");
      expect(cancelled.cancellationReason).toBe("Médico suspendido — cuenta suspendida por administración");

      const sent = notifications.suspensionCancellations.find((n) => n.to === patientEmail);
      expect(sent).toBeDefined();
      expect(sent?.refundPercent).toBe(100);
    });

    it("does not touch a still-unpaid (PENDING_PAYMENT) appointment when suspending — it expires on its own via M5-CA-002", async () => {
      const doctor = await registerAndVerifyDoctor();
      await prisma.doctor.update({ where: { userId: doctor.userId }, data: { acceptsTeleconsultation: true } });

      const serviceRes = await request(app.getHttpServer())
        .post("/doctors/me/services")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });

      const patientRes = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "Iván",
          lastNamePaternal: "Torres",
          birthDate: "1995-09-01",
          sexAtBirth: "M",
          phoneE164: uniquePhone(),
          email: uniqueEmail("patient"),
        });

      const apptRes = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          patientId: patientRes.body.id,
          serviceId: serviceRes.body.id,
          startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(apptRes.body.status).toBe("PENDING_PAYMENT");

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const admin = await createAdmin();
      const suspendRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctorRecord.id}/suspend`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.notifiedPatients).toBe(0);

      const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: apptRes.body.id } });
      expect(untouched.status).toBe("PENDING_PAYMENT");
    });
  });

  // CRITERIOS_DIFERIDOS.md: solo la mitad verificable hoy de M2-CA-007
  // — nada se borra ni se oculta. La accesibilidad para pacientes
  // depende de care_relationship/expediente (M8) y citas reales (M5),
  // ninguno de los cuales existe todavía; esa mitad queda diferida ahí.
  describe("M2-CA-007 — persistencia del perfil y documentos tras suspensión", () => {
    it("keeps the doctor's profile and uploaded documents intact (not deleted, not hidden) after suspension", async () => {
      const { userId, accessToken } = await registerAndVerifyDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });

      const upload = await request(app.getHttpServer())
        .post("/doctors/me/documents?docType=CEDULA_PROFESIONAL")
        .set("Authorization", `Bearer ${accessToken}`)
        .attach("file", Buffer.from("%PDF-1.4 fake cedula content"), {
          filename: "cedula.pdf",
          contentType: "application/pdf",
        });
      expect(upload.status).toBe(201);

      const admin = await createAdmin();
      const suspendRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/suspend`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(suspendRes.status).toBe(200);

      const stillThere = await prisma.doctor.findUnique({ where: { userId } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.displayName).toBe(doctor.displayName);

      const documents = await prisma.doctorDocument.findMany({ where: { doctorId: doctor.id } });
      expect(documents).toHaveLength(1);
      const [onlyDocument] = documents;
      if (!onlyDocument) {
        throw new Error("expected exactly one doctor_documents row to survive suspension");
      }
      expect(onlyDocument.id).toBe(upload.body.id);
    });
  });

  // CRITERIOS_DIFERIDOS.md: solo la mitad verificable hoy de M2-CA-008
  // — que `verified` refleja exactamente verificationStatus, sin
  // caché. El recordatorio a 60 días por vencimiento de cédula de
  // especialidad depende de una columna que no existe todavía en el
  // esquema, y queda diferido ahí.
  describe("M2-CA-008 — el sello de verificado refleja el estado, no un caché", () => {
    it.each(["DRAFT", "SUBMITTED", "IN_REVIEW", "REJECTED", "SUSPENDED"] as const)(
      "toPublicDoctorView reports verified:false when status is %s",
      async (status) => {
        const { userId } = await registerAndVerifyDoctor();
        await prisma.doctor.update({ where: { userId }, data: { verificationStatus: status } });
        const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });

        expect(toPublicDoctorView(doctor, null).verified).toBe(false);
      }
    );

    it("toPublicDoctorView reports verified:true only once status is VERIFIED", async () => {
      const { userId } = await registerAndVerifyDoctor();
      const admin = await createAdmin();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });

      const verifyRes = await request(app.getHttpServer())
        .post(`/admin/doctors/${doctor.id}/verify`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(verifyRes.status).toBe(200);

      const verified = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      expect(toPublicDoctorView(verified, null).verified).toBe(true);
    });
  });

  // DT-02: PATCH /doctors/me/locations/:id and PATCH
  // /doctors/me/services/:id had zero runtime validation before this —
  // body was typed Partial<X> in the controller, TypeScript-only. No
  // test file exercised either PATCH at all until now.
  describe("DT-02 — validación en tiempo de ejecución en los PATCH de locations/services", () => {
    it("PATCH /doctors/me/locations/:id accepts a valid partial update", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Consultorio Centro" });
      expect(create.status).toBe(201);

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/locations/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Consultorio Centro (reubicado)", isPrimary: true });
      expect(patch.status).toBe(200);
      expect(patch.body.name).toBe("Consultorio Centro (reubicado)");
      expect(patch.body.isPrimary).toBe(true);
    });

    it("PATCH /doctors/me/locations/:id rejects an unknown field (400)", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Consultorio Centro" });
      expect(create.status).toBe(201);

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/locations/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "x", notARealField: "hack" });
      expect(patch.status).toBe(400);
      expect(patch.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("PATCH /doctors/me/locations/:id rejects an out-of-range latitude (400)", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Consultorio Centro" });
      expect(create.status).toBe(201);

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/locations/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ latitude: 999 });
      expect(patch.status).toBe(400);
      expect(patch.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("PATCH /doctors/me/services/:id accepts a valid partial update", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/services")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
      expect(create.status).toBe(201);

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/services/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ priceMxn: 600 });
      expect(patch.status).toBe(200);
      expect(patch.body.priceMxnCents).toBe(60_000);
    });

    it("PATCH /doctors/me/services/:id rejects an invalid priceMxn (400)", async () => {
      const { accessToken } = await registerAndVerifyDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/services")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
      expect(create.status).toBe(201);

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/services/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ priceMxn: -50 });
      expect(patch.status).toBe(400);
      expect(patch.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
