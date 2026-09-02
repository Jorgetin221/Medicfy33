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

// M5-RN-009 a M5-RN-012 (spec §7, v2.3) — "Book Appointment" real,
// iniciado por el propio paciente desde el perfil público del médico.
describe("M5b — agendamiento público real del paciente", () => {
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

  async function verifyAndLogin(email: string, userId: string): Promise<string> {
    const code = notifications.emailCodes.get(email);
    if (!code) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email, password: STRONG_PASSWORD });
    expect(loginRes.status).toBe(200);
    return loginRes.body.accessToken as string;
  }

  async function registerBookableDoctor(): Promise<{ doctorId: string; serviceId: string; accessToken: string }> {
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
    const accessToken = await verifyAndLogin(email, userId);

    await prisma.doctor.update({ where: { userId }, data: { acceptsTeleconsultation: true, verificationStatus: "VERIFIED" } });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });

    const serviceRes = await request(app.getHttpServer())
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ serviceType: "TELECONSULTATION", name: "Teleconsulta", durationMinutes: 30, priceMxn: 500 });
    expect(serviceRes.status).toBe(201);

    return { doctorId: doctor.id, serviceId: serviceRes.body.id, accessToken };
  }

  async function registerPatient(): Promise<{ patientId: string; userId: string; accessToken: string }> {
    const email = uniqueEmail("patient");
    const res = await request(app.getHttpServer())
      .post("/auth/register/patient")
      .send({
        email,
        password: STRONG_PASSWORD,
        phone: uniquePhone(),
        firstName: "Karla",
        lastNamePaternal: "Núñez",
        birthDate: "1990-01-01",
        sexAtBirth: "F",
        consents: { privacyNotice: true, sensitiveData: true, digitalPrescriptionChannel: false },
      });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const accessToken = await verifyAndLogin(email, userId);
    const patient = await prisma.patient.findUniqueOrThrow({ where: { userId } });
    return { patientId: patient.id, userId, accessToken };
  }

  function futureSlot(): string {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    d.setUTCHours(18, 0, 0, 0);
    return d.toISOString();
  }

  describe("M5-CA-006 — agenda real, created_via=PATIENT_LINK, care_relationship con origin=APPOINTMENT", () => {
    it("crea la cita a nombre del paciente autenticado, sin vínculo previo", async () => {
      const doctor = await registerBookableDoctor();
      const patient = await registerPatient();

      const existing = await prisma.careRelationship.findFirst({ where: { patientId: patient.patientId, doctorId: doctor.doctorId } });
      expect(existing).toBeNull();

      const res = await request(app.getHttpServer())
        .post(`/doctors/${doctor.doctorId}/public-appointments`)
        .set("Authorization", `Bearer ${patient.accessToken}`)
        .send({ serviceId: doctor.serviceId, startsAt: futureSlot() });

      expect(res.status).toBe(201);
      expect(res.body.patientId).toBe(patient.patientId);
      expect(res.body.doctorId).toBe(doctor.doctorId);
      expect(res.body.createdVia).toBe("PATIENT_LINK");
      expect(res.body.status).toBe("PENDING_PAYMENT");

      const relationship = await prisma.careRelationship.findFirst({ where: { patientId: patient.patientId, doctorId: doctor.doctorId } });
      expect(relationship).not.toBeNull();
      expect(relationship?.origin).toBe("APPOINTMENT");
      expect(relationship?.status).toBe("ACTIVE");
    });

    it("la cita aparece en /patients/me/appointments del paciente", async () => {
      const doctor = await registerBookableDoctor();
      const patient = await registerPatient();

      const bookRes = await request(app.getHttpServer())
        .post(`/doctors/${doctor.doctorId}/public-appointments`)
        .set("Authorization", `Bearer ${patient.accessToken}`)
        .send({ serviceId: doctor.serviceId, startsAt: futureSlot() });
      expect(bookRes.status).toBe(201);

      const listRes = await request(app.getHttpServer())
        .get("/patients/me/appointments")
        .set("Authorization", `Bearer ${patient.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.find((a: { id: string }) => a.id === bookRes.body.id)).toBeDefined();
    });
  });

  describe("M5-CA-007 — patientId siempre resuelto del token, nunca del body (prueba de seguridad)", () => {
    it("rechaza el cuerpo si incluye un campo patientId (esquema .strict(), sin ese campo)", async () => {
      const doctor = await registerBookableDoctor();
      const patient = await registerPatient();
      const otherPatient = await registerPatient();

      const res = await request(app.getHttpServer())
        .post(`/doctors/${doctor.doctorId}/public-appointments`)
        .set("Authorization", `Bearer ${patient.accessToken}`)
        .send({ serviceId: doctor.serviceId, startsAt: futureSlot(), patientId: otherPatient.patientId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");

      const stolen = await prisma.careRelationship.findFirst({ where: { patientId: otherPatient.patientId, doctorId: doctor.doctorId } });
      expect(stolen).toBeNull();
    });
  });

  describe("M5-CA-008 — sin sesión, sin botón muerto", () => {
    it("responde 401 sin token de autenticación", async () => {
      const doctor = await registerBookableDoctor();
      const res = await request(app.getHttpServer())
        .post(`/doctors/${doctor.doctorId}/public-appointments`)
        .send({ serviceId: doctor.serviceId, startsAt: futureSlot() });
      expect(res.status).toBe(401);
    });

    it("un DOCTOR autenticado (sin fila patients propia) recibe 403, no 500", async () => {
      const doctor = await registerBookableDoctor();
      const anotherDoctor = await registerBookableDoctor();

      const res = await request(app.getHttpServer())
        .post(`/doctors/${doctor.doctorId}/public-appointments`)
        .set("Authorization", `Bearer ${anotherDoctor.accessToken}`)
        .send({ serviceId: doctor.serviceId, startsAt: futureSlot() });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PATIENT_PROFILE_NOT_FOUND");
    });
  });
});
