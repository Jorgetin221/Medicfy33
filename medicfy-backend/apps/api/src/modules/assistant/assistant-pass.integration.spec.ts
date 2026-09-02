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
import { ASSISTANT_MODEL_PORT, type AssistantModelCallInput, type AssistantModelOutcome, type AssistantModelPort } from "./services/assistant-model.port";
import { AssistantPassOrchestratorService } from "./services/assistant-pass-orchestrator.service";

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

// Doble de prueba del puerto del modelo: nunca toca la red. Permite
// configurar el siguiente resultado y una demora artificial (para
// probar el timeout) sin depender de Claude de verdad.
class FakeAssistantModelPort implements AssistantModelPort {
  public calls: AssistantModelCallInput[] = [];
  public delayMs = 0;
  public nextOutcome: AssistantModelOutcome = FakeAssistantModelPort.okOutcome();

  static okOutcome(overrides: { inputTokens?: number; outputTokens?: number } = {}): AssistantModelOutcome {
    return {
      kind: "ok",
      result: {
        reading: {
          meta: {
            version_modelo: "fake-model",
            version_prompt: "fake-v1",
            pase: "SUBJETIVO",
            momento: new Date().toISOString(),
            hash_contexto: "a".repeat(64),
            confianza_global: 0.5,
            por_que_esa_confianza: "Contexto de prueba.",
          },
          resumen: "Resumen de prueba.",
          hallazgos_clave: [],
          banderas_rojas: [],
          diferenciales: [],
          falta_por_preguntar: [],
          falta_por_explorar: [],
          estudios_sugeridos: [],
          plan_sugerido: [],
          no_puedo_saber: [],
          fuentes: [],
        },
        modelVersion: "fake-model",
        promptVersion: "fake-v1",
        inputTokens: overrides.inputTokens ?? 100,
        outputTokens: overrides.outputTokens ?? 50,
      },
    };
  }

  async generateReading(input: AssistantModelCallInput): Promise<AssistantModelOutcome> {
    this.calls.push(input);
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

// Fase 8 · Prompt 51 — "Los cuatro pases": disparo, tope de gasto,
// timeout/degradación honesta y cancelación, contra un doble del
// puerto del modelo (nunca la red real — eso se valida por separado
// con una consulta de humo, ver claude-model.adapter.spec.ts).
describe("AssistantController — Prompt 51 (Los cuatro pases)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let orchestrator: AssistantPassOrchestratorService;
  let fakePort: FakeAssistantModelPort;
  const originalTimeoutEnv = process.env.ASSISTANT_MODEL_TIMEOUT_MS;
  const originalCapEnv = process.env.ASSISTANT_MAX_TOKENS_PER_ENCOUNTER;

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
    orchestrator = moduleRef.get(AssistantPassOrchestratorService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    fakePort.calls = [];
    fakePort.delayMs = 0;
    fakePort.nextOutcome = FakeAssistantModelPort.okOutcome();
    if (originalTimeoutEnv !== undefined) process.env.ASSISTANT_MODEL_TIMEOUT_MS = originalTimeoutEnv;
    else delete process.env.ASSISTANT_MODEL_TIMEOUT_MS;
    if (originalCapEnv !== undefined) process.env.ASSISTANT_MAX_TOKENS_PER_ENCOUNTER = originalCapEnv;
    else delete process.env.ASSISTANT_MAX_TOKENS_PER_ENCOUNTER;
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

  async function createPatientWithDraftEncounter(accessToken: string): Promise<{ patientId: string; encounterId: string }> {
    const patientRes = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "PruebaP51",
        birthDate: "1990-01-01",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("paciente"),
      });
    expect(patientRes.status).toBe(201);
    const patientId = patientRes.body.id as string;

    const encounterRes = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(encounterRes.status).toBe(201);
    return { patientId, encounterId: encounterRes.body.id as string };
  }

  it("dispara un pase, lo persiste, y GET lo regresa como 'se conserva'", async () => {
    const doctor = await registerDoctor();
    const { encounterId } = await createPatientWithDraftEncounter(doctor.accessToken);

    const posted = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ pase: "SUBJETIVO" });
    expect(posted.status).toBe(201);
    expect(posted.body.kind).toBe("ok");
    expect(posted.body.reading.resumen).toBe("Resumen de prueba.");
    expect(fakePort.calls).toHaveLength(1);
    expect(fakePort.calls[0]!.pase).toBe("SUBJETIVO");

    const row = await prisma.assistantReading.findUniqueOrThrow({ where: { id: posted.body.readingId } });
    expect(row.encounterId).toBe(encounterId);
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);

    const listed = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(posted.body.readingId);
  });

  it("bloquea un pase nuevo con SPEND_CAP_REACHED una vez superado el tope, sin volver a llamar al modelo", async () => {
    process.env.ASSISTANT_MAX_TOKENS_PER_ENCOUNTER = "100";
    const doctor = await registerDoctor();
    const { encounterId } = await createPatientWithDraftEncounter(doctor.accessToken);

    const first = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ pase: "SUBJETIVO" });
    expect(first.body.kind).toBe("ok"); // 100 + 50 = 150 tokens gastados, ya sobre el tope de 100

    const second = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ pase: "OBJETIVO" });
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ kind: "unavailable", reason: "SPEND_CAP_REACHED" });
    expect(fakePort.calls).toHaveLength(1); // el modelo NUNCA se llamó para el segundo pase
  });

  it("DEGRADACIÓN HONESTA: si el modelo no responde a tiempo, el pase se marca no disponible por TIMEOUT, no se cae la consulta", async () => {
    process.env.ASSISTANT_MODEL_TIMEOUT_MS = "80";
    fakePort.delayMs = 500;
    const doctor = await registerDoctor();
    const { encounterId } = await createPatientWithDraftEncounter(doctor.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ pase: "SUBJETIVO" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ kind: "unavailable", reason: "TIMEOUT" });

    const stored = await prisma.assistantReading.findMany({ where: { encounterId } });
    expect(stored).toHaveLength(0); // nada se persiste de un pase que no llegó
  });

  it("cancelación: una señal ya abortada nunca llega a llamar al modelo", async () => {
    const doctor = await registerDoctor();
    const { encounterId } = await createPatientWithDraftEncounter(doctor.accessToken);
    const controller = new AbortController();
    controller.abort();

    const outcome = await orchestrator.requestPass(encounterId, "SUBJETIVO", controller.signal);
    expect(outcome).toEqual({ kind: "cancelled" });
    expect(fakePort.calls).toHaveLength(0);
  });

  it("R4 — un médico sin vínculo con el paciente no puede disparar ni listar pases (403)", async () => {
    const owner = await registerDoctor();
    const { encounterId } = await createPatientWithDraftEncounter(owner.accessToken);
    const stranger = await registerDoctor();

    const posted = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ pase: "SUBJETIVO" });
    expect(posted.status).toBe(403);

    const listed = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/assistant/passes`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(listed.status).toBe(403);
    expect(fakePort.calls).toHaveLength(0);
  });
});
