import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "./services/notification.port";

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

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    email: uniqueEmail("patient"),
    password: STRONG_PASSWORD,
    phone: uniquePhone(),
    firstName: "Karla",
    lastNamePaternal: "Núñez",
    lastNameMaternal: "Ortiz",
    birthDate: "1990-01-01",
    sexAtBirth: "F",
    consents: { privacyNotice: true, sensitiveData: true, digitalPrescriptionChannel: false },
    ...overrides,
  };
}

// M5-RN-009 (spec §7, v2.3): "sin cuenta no hay cita" (M5-RN-008) solo
// tiene sentido si el registro de verdad crea la fila `patients`, no
// solo el `user` — antes de esta versión no la creaba.
describe("M5-RN-009 — autoregistro de paciente crea también su fila patients", () => {
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

  it("crea user + patient en la misma operación, y GET /patients/me la resuelve tras iniciar sesión", async () => {
    const body = baseBody();
    const registerRes = await request(app.getHttpServer()).post("/auth/register/patient").send(body);
    expect(registerRes.status).toBe(201);
    const userId = registerRes.body.userId as string;

    const patientRow = await prisma.patient.findUnique({ where: { userId } });
    expect(patientRow).not.toBeNull();
    expect(patientRow?.source).toBe("SELF_SIGNUP");
    expect(patientRow?.firstName).toBe("Karla");
    expect(patientRow?.medicfyId).toMatch(/^MDF-\d{6}$/);

    const code = notifications.emailCodes.get(body.email);
    if (!code) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: body.email, password: STRONG_PASSWORD });
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.accessToken as string;

    const meRes = await request(app.getHttpServer()).get("/patients/me").set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe(patientRow?.id);
    expect(meRes.body.medicfyId).toBe(patientRow?.medicfyId);
  });

  it("rechaza el registro de un menor de edad por su cuenta (400)", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register/patient")
      .send(baseBody({ birthDate: "2015-01-01" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /patients/me responde 404 para un DOCTOR autenticado (nunca tiene fila patients propia)", async () => {
    const email = uniqueEmail("doctor");
    const registerRes = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email,
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: Math.floor(1000000 + Math.random() * 8999999).toString(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(registerRes.status).toBe(201);
    const userId = registerRes.body.userId as string;
    const code = notifications.emailCodes.get(email);
    if (!code) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });

    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email, password: STRONG_PASSWORD });
    expect(loginRes.status).toBe(200);

    const meRes = await request(app.getHttpServer())
      .get("/patients/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(404);
  });
});
