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

class TestNotificationAdapter implements NotificationPort {
  public readonly emailCodes = new Map<string, string>();
  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.emailCodes.set(to, code);
  }
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

// M2B (spec §7, v2.2): publicaciones del médico y control de
// audiencia. El foco de estas pruebas es la autorización — M2B-RN-002
// exige que sea el backend, nunca el frontend, quien decida qué
// publicación sale en cada respuesta.
describe("M2B — Publicaciones del médico y control de audiencia", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let passwordService: PasswordService;
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

  // No hay portal de pacientes (spec §7 M2B) — para probar la
  // autorización de PATIENTS_ONLY se construye el vínculo directo por
  // Prisma, como haría un care_relationship real creado por una cita.
  async function createPatientWithRelationship(doctorId: string, active: boolean): Promise<{ userId: string; accessToken: string }> {
    const passwordHash = await passwordService.hash(STRONG_PASSWORD);
    const patientUser = await prisma.user.create({
      data: {
        email: uniqueEmail("patient"),
        passwordHash,
        primaryRole: "PATIENT",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: "Karla",
        lastNamePaternal: "Núñez",
        birthDate: new Date("1990-01-01"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient-record"),
        source: "SELF_SIGNUP",
      },
    });
    if (active) {
      await prisma.careRelationship.create({
        data: {
          patientId: patient.id,
          doctorId,
          origin: "APPOINTMENT",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
    const accessToken = tokenService.signAccessToken({ sub: patientUser.id, primaryRole: "PATIENT" });
    return { userId: patientUser.id, accessToken };
  }

  async function createAndPublish(
    accessToken: string,
    overrides: { visibility?: string; status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" } = {}
  ): Promise<{ id: string }> {
    const create = await request(app.getHttpServer())
      .post("/doctors/me/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ body: "Contenido de prueba de al menos unos caracteres.", category: "HEALTH_TIP", visibility: overrides.visibility ?? "PUBLIC" });
    expect(create.status).toBe(201);
    if (overrides.status && overrides.status !== "DRAFT") {
      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/posts/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ status: overrides.status });
      expect(patch.status).toBe(200);
    }
    return create.body;
  }

  describe("M2B-CA-001 — visibility=PRIVATE nunca sale salvo al autor", () => {
    it("no aparece en el feed público ni en el de pacientes, pero sí en el panel propio", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PRIVATE", status: "PUBLISHED" });

      const publicRes = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();

      const patient = await createPatientWithRelationship(doctorRow.id, true);
      const patientsOnlyRes = await request(app.getHttpServer())
        .get(`/doctors/${doctorRow.id}/posts/patients-only`)
        .set("Authorization", `Bearer ${patient.accessToken}`);
      expect(patientsOnlyRes.status).toBe(200);
      expect(patientsOnlyRes.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();

      const ownRes = await request(app.getHttpServer())
        .get(`/doctors/me/posts/${post.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(ownRes.status).toBe(200);
      expect(ownRes.body.id).toBe(post.id);
    });
  });

  describe("M2B-CA-002 — visibility=PATIENTS_ONLY solo con care_relationship activo", () => {
    it("nunca aparece en el feed público", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PATIENTS_ONLY", status: "PUBLISHED" });

      const publicRes = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(publicRes.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();
    });

    it("responde 401 sin autenticación", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const res = await request(app.getHttpServer()).get(`/doctors/${doctorRow.id}/posts/patients-only`);
      expect(res.status).toBe(401);
    });

    it("responde 403 a un usuario autenticado sin vínculo activo", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      await createAndPublish(doctor.accessToken, { visibility: "PATIENTS_ONLY", status: "PUBLISHED" });

      const patient = await createPatientWithRelationship(doctorRow.id, false);
      const res = await request(app.getHttpServer())
        .get(`/doctors/${doctorRow.id}/posts/patients-only`)
        .set("Authorization", `Bearer ${patient.accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    });

    it("devuelve la publicación a un paciente con vínculo activo", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PATIENTS_ONLY", status: "PUBLISHED" });

      const patient = await createPatientWithRelationship(doctorRow.id, true);
      const res = await request(app.getHttpServer())
        .get(`/doctors/${doctorRow.id}/posts/patients-only`)
        .set("Authorization", `Bearer ${patient.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.find((p: { id: string }) => p.id === post.id)).toBeDefined();
    });
  });

  describe("M2B-CA-003 — cambiar de PUBLIC a PRIVATE la retira de inmediato", () => {
    it("deja de responder en la ruta pública tras el cambio", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const before = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(before.body.find((p: { id: string }) => p.id === post.id)).toBeDefined();

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/posts/${post.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ visibility: "PRIVATE" });
      expect(patch.status).toBe(200);

      const after = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(after.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();
    });
  });

  describe("M2B-CA-004 — status=DRAFT nunca sale, sin importar visibility", () => {
    it("una publicación PUBLIC en borrador no aparece en el feed público", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC" });

      const res = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(res.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();
    });
  });

  describe("M2B-CA-005 — status=ARCHIVED sale de toda vista pública/pacientes, el autor la conserva", () => {
    it("archivar una publicación PUBLIC la retira del feed pero sigue en el panel propio", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const patch = await request(app.getHttpServer())
        .patch(`/doctors/me/posts/${post.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ status: "ARCHIVED" });
      expect(patch.status).toBe(200);
      expect(patch.body.archivedAt).not.toBeNull();

      const publicRes = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(publicRes.body.find((p: { id: string }) => p.id === post.id)).toBeUndefined();

      const ownRes = await request(app.getHttpServer())
        .get(`/doctors/me/posts/${post.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(ownRes.status).toBe(200);
    });
  });

  describe("M2B-CA-007 — moderación mínima de admin", () => {
    it("un ADMIN archiva la publicación de cualquier médico, y queda auditado", async () => {
      const doctor = await registerAndVerifyDoctor();
      const admin = await createAdmin();
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const res = await request(app.getHttpServer())
        .post(`/admin/doctor-posts/${post.id}/archive`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ARCHIVED");
      expect(res.body.archivedByUserId).toBe(admin.userId);

      const auditEntry = await prisma.auditLog.findFirst({
        where: { action: "doctor_post.archived_by_admin", resourceId: post.id, result: "SUCCESS" },
      });
      expect(auditEntry).not.toBeNull();
    });

    it("rechaza a un no-admin con 403", async () => {
      const doctor = await registerAndVerifyDoctor();
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const res = await request(app.getHttpServer())
        .post(`/admin/doctor-posts/${post.id}/archive`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(403);
    });

    it("un médico no puede editar/archivar la publicación de otro médico (404, no 200)", async () => {
      const doctorA = await registerAndVerifyDoctor();
      const doctorB = await registerAndVerifyDoctor();
      const post = await createAndPublish(doctorA.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const res = await request(app.getHttpServer())
        .patch(`/doctors/me/posts/${post.id}`)
        .set("Authorization", `Bearer ${doctorB.accessToken}`)
        .send({ status: "ARCHIVED" });
      expect(res.status).toBe(404);
    });
  });

  describe("M2B-CA-008 — un médico SUSPENDED no crea ni publica contenido nuevo", () => {
    it("bloquea la creación y la transición a PUBLISHED tras suspender, y conserva lo ya publicado", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const alreadyPublished = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });
      const draft = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC" });

      await prisma.doctor.update({ where: { id: doctorRow.id }, data: { verificationStatus: "SUSPENDED" } });

      const createRes = await request(app.getHttpServer())
        .post("/doctors/me/posts")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ body: "Otro intento de publicación.", category: "ANNOUNCEMENT", visibility: "PUBLIC" });
      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe("DOCTOR_SUSPENDED");

      const publishRes = await request(app.getHttpServer())
        .patch(`/doctors/me/posts/${draft.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ status: "PUBLISHED" });
      expect(publishRes.status).toBe(403);
      expect(publishRes.body.error.code).toBe("DOCTOR_SUSPENDED");

      const publicRes = await request(app.getHttpServer()).get(`/doctors/${doctorRow.slug}/public/posts`);
      expect(publicRes.body.find((p: { id: string }) => p.id === alreadyPublished.id)).toBeDefined();
    });
  });

  describe("M2B-RN-005 — medios: imagen sí, video PENDIENTE(jorge)", () => {
    it("sube una foto y la sirve por la ruta pública solo si la publicación es PUBLIC y PUBLISHED", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PUBLIC", status: "PUBLISHED" });

      const upload = await request(app.getHttpServer())
        .post(`/doctors/me/posts/${post.id}/media?mediaType=PHOTO`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: "foto.jpg", contentType: "image/jpeg" });
      expect(upload.status).toBe(201);

      const publicMedia = await request(app.getHttpServer()).get(
        `/doctors/${doctorRow.slug}/public/posts/${post.id}/media/${upload.body.id}`
      );
      expect(publicMedia.status).toBe(200);
      expect(Buffer.compare(Buffer.from(publicMedia.body), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(0);
    });

    it("no sirve el medio de una publicación PRIVATE por la ruta pública (404)", async () => {
      const doctor = await registerAndVerifyDoctor();
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const post = await createAndPublish(doctor.accessToken, { visibility: "PRIVATE", status: "PUBLISHED" });

      const upload = await request(app.getHttpServer())
        .post(`/doctors/me/posts/${post.id}/media?mediaType=PHOTO`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: "foto.jpg", contentType: "image/jpeg" });
      expect(upload.status).toBe(201);

      const publicMedia = await request(app.getHttpServer()).get(
        `/doctors/${doctorRow.slug}/public/posts/${post.id}/media/${upload.body.id}`
      );
      expect(publicMedia.status).toBe(404);
    });

    it("rechaza mediaType=VIDEO con 400 (PENDIENTE(jorge): sin tamaño/formato definido)", async () => {
      const doctor = await registerAndVerifyDoctor();
      const post = await createAndPublish(doctor.accessToken, { visibility: "PRIVATE" });

      const upload = await request(app.getHttpServer())
        .post(`/doctors/me/posts/${post.id}/media?mediaType=VIDEO`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .attach("file", Buffer.from([0, 1, 2, 3]), { filename: "video.mp4", contentType: "video/mp4" });
      expect(upload.status).toBe(400);
    });
  });
});
