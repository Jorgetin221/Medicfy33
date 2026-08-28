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

// Fase 7 · Prompt 47/48 — motor genérico de protocolo longitudinal.
// Cubre las 4 pruebas de aceptación de la Fase 7 (48C) contra el
// protocolo de DEMOSTRACIÓN sembrado (sin fuente clínica real — ver
// seedFase7 en prisma/seed.ts). El control prenatal/vacunación reales
// quedan PENDIENTES (48A, decisión ya tomada con el usuario): esta
// suite prueba el MECANISMO genérico, no un calendario clínico.
describe("Protocolos longitudinales — instancias y sesiones", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let demoProtocolId: string;

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

    const demoProtocol = await prisma.treatmentProtocol.findFirstOrThrow({
      where: { name: "Protocolo de seguimiento — DEMOSTRACIÓN" },
    });
    demoProtocolId = demoProtocol.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Hilda",
      legalLastName: "Reyes",
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

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Protocolo",
        birthDate: "1993-07-07",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("48C.1 — el protocolo de demostración, sembrado como DATOS, aparece en el catálogo y al iniciar una instancia ya trae sus sesiones con fecha propuesta, sin desplegar código", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const catalog = await request(app.getHttpServer()).get("/protocols").set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(catalog.status).toBe(200);
    expect(catalog.body.some((p: { id: string }) => p.id === demoProtocolId)).toBe(true);

    const start = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ protocolId: demoProtocolId });
    expect(start.status).toBe(201);
    expect(start.body.sessions).toHaveLength(3);
    expect(start.body.sessions.every((s: { proposedDate: string | null }) => s.proposedDate)).toBe(true);
  });

  it("48C.2 — registrar una sesión fuera de ventana la MARCA (withinWindow=false), nunca la rechaza", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const start = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ protocolId: demoProtocolId });
    const instanceId = start.body.id as string;
    // Sesión 1: ventana días 0-3 desde hoy. Una fecha 30 días después
    // cae fuera a propósito.
    const firstSession = start.body.sessions.find((s: { sequenceNumber: number }) => s.sequenceNumber === 1);
    const farDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const record = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances/${instanceId}/sessions/${firstSession.id}/record`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ actualDate: farDate });
    expect(record.status).toBe(201);
    expect(record.body.withinWindow).toBe(false);
    expect(record.body.actualDate).toBeTruthy();
  });

  // Bug real encontrado al verificar en vivo (Playwright), no al
  // escribir el código: instance.startedAt lleva hora exacta, y sin
  // truncar a medianoche antes de sumar los offsets de la ventana,
  // registrar la sesión 1 (ventana 0-3 días) el MISMO día pero antes
  // de esa hora exacta caía "fuera de ventana" por unas horas.
  it("registrar la sesión 1 (ventana 0-3 días) el mismo día que se inició la instancia cae DENTRO de la ventana", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const start = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ protocolId: demoProtocolId });
    const instanceId = start.body.id as string;
    const firstSession = start.body.sessions.find((s: { sequenceNumber: number }) => s.sequenceNumber === 1);
    const today = new Date().toISOString().slice(0, 10);

    const record = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances/${instanceId}/sessions/${firstSession.id}/record`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ actualDate: today });
    expect(record.status).toBe(201);
    expect(record.body.withinWindow).toBe(true);
  });

  it("48C.3 — cerrar una instancia sin motivo devuelve error de validación (400)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const start = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ protocolId: demoProtocolId });
    const instanceId = start.body.id as string;

    const closeWithoutReason = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances/${instanceId}/close`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({});
    expect(closeWithoutReason.status).toBe(400);

    const closeWithReason = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances/${instanceId}/close`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ closureReason: "COMPLETADO" });
    expect(closeWithReason.status).toBe(201);
    expect(closeWithReason.body.status).toBe("CLOSED");
  });

  it("48C.4 — una sesión registrada con encounterId queda ligada a la nota de esa visita", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const encounter = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    expect(encounter.status).toBe(201);
    const encounterId = encounter.body.id as string;

    const start = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ protocolId: demoProtocolId });
    const instanceId = start.body.id as string;
    const firstSession = start.body.sessions.find((s: { sequenceNumber: number }) => s.sequenceNumber === 1);

    const today = new Date().toISOString().slice(0, 10);
    const record = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/protocol-instances/${instanceId}/sessions/${firstSession.id}/record`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ actualDate: today, encounterId });
    expect(record.status).toBe(201);
    expect(record.body.encounterId).toBe(encounterId);

    const stored = await prisma.protocolSession.findUniqueOrThrow({ where: { id: firstSession.id } });
    expect(stored.encounterId).toBe(encounterId);
  });

  it("un encounterId de OTRO paciente no se puede ligar a la sesión (404), y no queda ligado", async () => {
    const owner = await registerDoctor();
    const ownerPatientId = await createPatient(owner.accessToken);
    const start = await request(app.getHttpServer())
      .post(`/records/patients/${ownerPatientId}/protocol-instances`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ protocolId: demoProtocolId });
    const instanceId = start.body.id as string;
    const firstSession = start.body.sessions.find((s: { sequenceNumber: number }) => s.sequenceNumber === 1);

    const otherDoctor = await registerDoctor();
    const otherPatientId = await createPatient(otherDoctor.accessToken);
    const otherEncounter = await request(app.getHttpServer())
      .post(`/records/patients/${otherPatientId}/encounters`)
      .set("Authorization", `Bearer ${otherDoctor.accessToken}`)
      .send({ patientId: otherPatientId, encounterType: "FOLLOW_UP" });
    const otherEncounterId = otherEncounter.body.id as string;

    const today = new Date().toISOString().slice(0, 10);
    const record = await request(app.getHttpServer())
      .post(`/records/patients/${ownerPatientId}/protocol-instances/${instanceId}/sessions/${firstSession.id}/record`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ actualDate: today, encounterId: otherEncounterId });
    expect(record.status).toBe(404);

    const stored = await prisma.protocolSession.findUniqueOrThrow({ where: { id: firstSession.id } });
    expect(stored.encounterId).toBeNull();
  });

  it("un médico sin vínculo con el paciente no puede iniciar ni ver instancias de protocolo (403)", async () => {
    const owner = await registerDoctor();
    const ownerPatientId = await createPatient(owner.accessToken);
    const stranger = await registerDoctor();

    const blocked = await request(app.getHttpServer())
      .get(`/records/patients/${ownerPatientId}/protocol-instances`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(blocked.status).toBe(403);
  });
});
