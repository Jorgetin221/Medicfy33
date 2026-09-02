import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "../identity/services/notification.port";
import { TokenService } from "../identity/services/token.service";
import {
  ASSISTANT_MODEL_PORT,
  type AssistantModelCallInput,
  type AssistantModelOutcome,
  type AssistantModelPort,
  type AssistantSummaryCallInput,
  type AssistantSummaryOutcome,
} from "./services/assistant-model.port";

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

// Doble de prueba: generateReading no se usa en esta suite (el
// resumen objetivo es una llamada aparte, más pequeña — ver
// claude-model.adapter.ts).
class FakeAssistantModelPort implements AssistantModelPort {
  public summaryCalls: AssistantSummaryCallInput[] = [];
  public delayMs = 0;
  public nextOutcome: AssistantSummaryOutcome = { kind: "ok", resumen: "Resumen de prueba." };

  async generateReading(_input: AssistantModelCallInput): Promise<AssistantModelOutcome> {
    throw new Error("not used in this suite");
  }

  async generateSummary(input: AssistantSummaryCallInput): Promise<AssistantSummaryOutcome> {
    this.summaryCalls.push(input);
    if (this.delayMs > 0) {
      const aborted = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), this.delayMs);
        input.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (aborted) return { kind: "cancelled" };
    }
    if (input.signal.aborted) return { kind: "cancelled" };
    return this.nextOutcome;
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

// "Resumen objetivo" — a petición explícita del usuario (2026-09-02):
// más rápido y sin persistencia, deliberadamente distinto de
// requestPass()/assistant_readings.
describe("AssistantController — Resumen objetivo", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let fakePort: FakeAssistantModelPort;
  const originalTimeoutEnv = process.env.ASSISTANT_SUMMARY_TIMEOUT_MS;

  beforeAll(async () => {
    fakePort = new FakeAssistantModelPort();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(new TestNotificationAdapter())
      .overrideProvider(ASSISTANT_MODEL_PORT)
      .useValue(fakePort)
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

  afterEach(() => {
    fakePort.summaryCalls = [];
    fakePort.delayMs = 0;
    fakePort.nextOutcome = { kind: "ok", resumen: "Resumen de prueba." };
    if (originalTimeoutEnv !== undefined) process.env.ASSISTANT_SUMMARY_TIMEOUT_MS = originalTimeoutEnv;
    else delete process.env.ASSISTANT_SUMMARY_TIMEOUT_MS;
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
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
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createDraftEncounter(accessToken: string): Promise<string> {
    const patientRes = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Resumen",
        birthDate: "1990-01-01",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("paciente"),
      });
    expect(patientRes.status).toBe(201);
    const encounterRes = await request(app.getHttpServer())
      .post(`/records/patients/${patientRes.body.id}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId: patientRes.body.id, encounterType: "FIRST_VISIT" });
    expect(encounterRes.status).toBe(201);
    return encounterRes.body.id as string;
  }

  it("regresa el resumen y NO lo persiste en assistant_readings (a diferencia de un pase)", async () => {
    const doctor = await registerDoctor();
    const encounterId = await createDraftEncounter(doctor.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/summary`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ kind: "ok", resumen: "Resumen de prueba." });
    expect(fakePort.summaryCalls).toHaveLength(1);

    const rows = await prisma.assistantReading.findMany({ where: { encounterId } });
    expect(rows).toHaveLength(0);
  });

  it("no comparte el tope de gasto de los pases — se puede pedir aunque el encuentro ya esté al tope", async () => {
    const doctor = await registerDoctor();
    const encounterId = await createDraftEncounter(doctor.accessToken);
    await prisma.assistantReading.create({
      data: {
        encounterId,
        pase: "SUBJETIVO",
        contextHashSha256: "a".repeat(64),
        readingJson: {},
        modelVersion: "test",
        promptVersion: "test",
        inputTokens: 10_000_000,
        outputTokens: 10_000_000,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/summary`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("ok");
  });

  it("degradación honesta: si no responde a tiempo, regresa TIMEOUT sin caerse", async () => {
    process.env.ASSISTANT_SUMMARY_TIMEOUT_MS = "80";
    fakePort.delayMs = 500;
    const doctor = await registerDoctor();
    const encounterId = await createDraftEncounter(doctor.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/summary`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ kind: "unavailable", reason: "TIMEOUT" });
  });

  it("R4 — un médico sin vínculo con el paciente no puede pedir el resumen (403)", async () => {
    const owner = await registerDoctor();
    const encounterId = await createDraftEncounter(owner.accessToken);
    const stranger = await registerDoctor();

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/summary`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(fakePort.summaryCalls).toHaveLength(0);
  });
});
