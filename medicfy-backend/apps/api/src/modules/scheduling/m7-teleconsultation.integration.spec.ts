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
import { VIDEO_PROVIDER_PORT } from "./services/video-provider.port";
import type { CreateVideoRoomInput, VideoProviderPort, VideoRoom } from "./services/video-provider.port";

// NOTA: igual que m5a.integration.spec.ts, esta prueba necesita
// Postgres real (Testcontainers) para correr — no ejecutable en el
// entorno de trabajo donde se escribió (sin Docker/Postgres
// disponible ahí), queda lista para CI/el entorno del equipo.

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

// Doble determinista del proveedor: nunca toca la red, siempre
// "configurado", devuelve un enlace estable por appointmentId — así
// una prueba de idempotencia puede afirmar sobre el mismo valor.
class TestVideoProviderAdapter implements VideoProviderPort {
  public readonly calls: CreateVideoRoomInput[] = [];
  isConfigured(): boolean {
    return true;
  }
  async createRoom(input: CreateVideoRoomInput): Promise<VideoRoom> {
    this.calls.push(input);
    return { providerRef: `test-${input.appointmentId}`, roomUrl: `https://video.test/${input.appointmentId}` };
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
  return Math.floor(10000000 + Math.random() * 89999999).toString();
}

function isoDaysFromNow(days: number, hour = 10): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

describe("M7 — Teleconsulta (MVP: enlace de proveedor externo)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let videoProvider: TestVideoProviderAdapter;

  beforeAll(async () => {
    videoProvider = new TestVideoProviderAdapter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(new TestNotificationAdapter())
      .overrideProvider(VIDEO_PROVIDER_PORT)
      .useValue(videoProvider)
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
    await prisma.doctor.update({ where: { userId }, data: { acceptsTeleconsultation: true } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createService(accessToken: string, serviceType: "FIRST_VISIT" | "TELECONSULTATION"): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ serviceType, name: serviceType === "TELECONSULTATION" ? "Teleconsulta" : "Consulta", durationMinutes: 30, priceMxn: 500 });
    expect(res.status).toBe(201);
    return { id: res.body.id as string };
  }

  async function createAdultPatient(accessToken: string): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Luis",
        lastNamePaternal: "Hernández",
        birthDate: "1990-05-15",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string };
  }

  async function bookAppointment(accessToken: string, patientId: string, serviceId: string): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, serviceId, startsAt: isoDaysFromNow(10) });
    expect(res.status).toBe(201);
    return { id: res.body.id as string };
  }

  it("CA-1/CA-4: una cita en línea ya en curso recibe el enlace del proveedor, y una segunda llamada devuelve el mismo enlace sin volver a pedirlo", async () => {
    const doctor = await registerDoctor();
    const service = await createService(doctor.accessToken, "TELECONSULTATION");
    const patient = await createAdultPatient(doctor.accessToken);
    const appointment = await bookAppointment(doctor.accessToken, patient.id, service.id);

    await request(app.getHttpServer()).post(`/appointments/${appointment.id}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);

    const first = await request(app.getHttpServer()).post(`/appointments/${appointment.id}/video-room`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ kind: "ok", room: { url: `https://video.test/${appointment.id}` } });

    const second = await request(app.getHttpServer()).post(`/appointments/${appointment.id}/video-room`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(second.body).toEqual(first.body);
    expect(videoProvider.calls).toHaveLength(1);

    const persisted = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(persisted.videoRoomUrl).toBe(`https://video.test/${appointment.id}`);
    expect(persisted.videoProviderRef).toBe(`test-${appointment.id}`);
  });

  it("una cita agendada como presencial también puede pedir el enlace (videollamada ad hoc, sin importar la modalidad)", async () => {
    const doctor = await registerDoctor();
    const service = await createService(doctor.accessToken, "FIRST_VISIT");
    const patient = await createAdultPatient(doctor.accessToken);
    const appointment = await bookAppointment(doctor.accessToken, patient.id, service.id);
    await request(app.getHttpServer()).post(`/appointments/${appointment.id}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);

    const res = await request(app.getHttpServer()).post(`/appointments/${appointment.id}/video-room`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ kind: "ok", room: { url: `https://video.test/${appointment.id}` } });
  });

  it("CA-3: una cita que todavía no está en curso no puede pedir enlace (409)", async () => {
    const doctor = await registerDoctor();
    const service = await createService(doctor.accessToken, "TELECONSULTATION");
    const patient = await createAdultPatient(doctor.accessToken);
    const appointment = await bookAppointment(doctor.accessToken, patient.id, service.id);

    const res = await request(app.getHttpServer()).post(`/appointments/${appointment.id}/video-room`).set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPOINTMENT_TRANSITION_INVALID");
  });

  it("R4: un médico ajeno a la cita no puede pedir su enlace de teleconsulta", async () => {
    const doctor = await registerDoctor();
    const service = await createService(doctor.accessToken, "TELECONSULTATION");
    const patient = await createAdultPatient(doctor.accessToken);
    const appointment = await bookAppointment(doctor.accessToken, patient.id, service.id);
    await request(app.getHttpServer()).post(`/appointments/${appointment.id}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);

    const intruso = await registerDoctor();
    const res = await request(app.getHttpServer()).post(`/appointments/${appointment.id}/video-room`).set("Authorization", `Bearer ${intruso.accessToken}`);
    expect([403, 404]).toContain(res.status);
  });
});
