import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { TokenService } from "../identity/services/token.service";
import { CareRelationshipService } from "../scheduling/services/care-relationship.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "./record-share-notification.port";

/**
 * PR-EXP-02 — Solicitud del médico. Cubre el criterio de terminación
 * completo del prompt maestro. Mismo patrón de arranque que
 * doctor-verification-enforcement.integration.spec.ts (AppModule real,
 * HTTP real vía supertest). La búsqueda/envío corre asíncrono
 * (RE5) — las pruebas que dependen de su resultado usan waitFor() en
 * vez de esperar que la respuesta HTTP ya lo refleje.
 */
class RecordingNotificationAdapter implements RecordShareNotificationPort {
  public sent: Array<{ destination: string; authorizationUrl: string }> = [];
  async sendAuthorizationRequest(input: { destination: string; authorizationUrl: string }): Promise<void> {
    this.sent.push({ destination: input.destination, authorizationUrl: input.authorizationUrl });
  }
  // No usados por este archivo (son del flujo de PR-EXP-03) — stubs
  // solo para satisfacer la interfaz.
  async sendOtpCode(): Promise<void> {}
  async sendApprovalConfirmation(): Promise<void> {}
  async sendRevocationNotice(): Promise<void> {}
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

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

async function waitFor(condition: () => Promise<boolean>, { timeoutMs = 3000, intervalMs = 50 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor: condition never became true within ${timeoutMs}ms`);
}

describe("Expediente compartido — PR-EXP-02 (solicitud del médico)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let careRelationshipService: CareRelationshipService;
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
    tokenService = moduleRef.get(TokenService);
    careRelationshipService = moduleRef.get(CareRelationshipService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerVerifiedDoctor(legalFirstName: string): Promise<{ userId: string; doctorId: string; accessToken: string }> {
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

  async function registerUnverifiedDoctor(): Promise<{ accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "SinVerificar",
      legalLastName: "ExpCompartido",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const accessToken = tokenService.signAccessToken({ sub: res.body.userId as string, primaryRole: "DOCTOR" });
    return { accessToken };
  }

  type PatientFixture = { id: string; firstName: string; lastNamePaternal: string; birthDate: Date; phoneE164: string; email: string };

  async function createPatientFixture(overrides: Partial<Pick<PatientFixture, "birthDate" | "firstName" | "lastNamePaternal">> = {}): Promise<PatientFixture> {
    const patient = await prisma.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: overrides.firstName ?? "María José",
        lastNamePaternal: overrides.lastNamePaternal ?? "Peña",
        birthDate: overrides.birthDate ?? new Date("1990-03-15"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        source: "CREATED_BY_DOCTOR",
      },
    });
    return patient;
  }

  function matchingRequestBody(patient: PatientFixture, overrides: Record<string, unknown> = {}) {
    return {
      patient: {
        firstName: patient.firstName,
        lastNamePaternal: patient.lastNamePaternal,
        birthDate: patient.birthDate.toISOString().slice(0, 10),
        phone: patient.phoneE164,
      },
      reason: "Valoración por dolor torácico y antecedentes cardiovasculares",
      scope: ["SUMMARY"],
      durationDays: 30,
      ...overrides,
    };
  }

  it("CA-1: bloquea a un médico sin verificar con 403", async () => {
    const unverified = await registerUnverifiedDoctor();
    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${unverified.accessToken}`)
      .send(matchingRequestBody(await createPatientFixture()));
    expect(res.status).toBe(403);
  });

  it("CA-2: la respuesta es idéntica (cuerpo y tiempo) exista o no coincidencia", async () => {
    const requester = await registerVerifiedDoctor("Elena");
    const patient = await createPatientFixture();
    const custodian = await registerVerifiedDoctor("Custodio");
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");

    const startMatch = Date.now();
    const matchRes = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));
    const matchDurationMs = Date.now() - startMatch;

    const startNoMatch = Date.now();
    const noMatchRes = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(
        matchingRequestBody({
          ...patient,
          firstName: "NombreQueNoExiste",
          phoneE164: "+525599999999",
        } as PatientFixture)
      );
    const noMatchDurationMs = Date.now() - startNoMatch;

    expect(matchRes.status).toBe(200);
    expect(noMatchRes.status).toBe(200);
    expect(matchRes.body).toEqual(noMatchRes.body);
    // Tolerancia generosa (500ms): lo que importa es que NINGUNO de
    // los dos haga una consulta de coincidencia antes de responder
    // (eso corre después, sin esperarlo) — no se busca medir
    // microsegundos en una suite de integración.
    expect(Math.abs(matchDurationMs - noMatchDurationMs)).toBeLessThan(500);
  });

  it("CA-5: crea N solicitudes para N custodios distintos del mismo paciente", async () => {
    const requester = await registerVerifiedDoctor("Solicitante");
    const patient = await createPatientFixture();
    const custodianA = await registerVerifiedDoctor("CustodioA");
    const custodianB = await registerVerifiedDoctor("CustodioB");
    await careRelationshipService.createOrRenew(patient.id, custodianA.doctorId, "APPOINTMENT");
    await careRelationshipService.createOrRenew(patient.id, custodianB.doctorId, "APPOINTMENT");

    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));
    expect(res.status).toBe(200);

    await waitFor(async () => {
      const count = await prisma.recordShareRequest.count({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } });
      return count === 2;
    });
    const created = await prisma.recordShareRequest.findMany({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } });
    expect(created.map((r) => r.custodianDoctorId).sort()).toEqual([custodianA.doctorId, custodianB.doctorId].sort());
    expect(created.every((r) => r.status === "PENDING_PATIENT")).toBe(true);
    expect(notifications.sent.some((n) => n.destination === patient.email)).toBe(true);
  });

  it("CA-6: un paciente menor de edad queda bloqueado (ninguna solicitud se crea)", async () => {
    const requester = await registerVerifiedDoctor("SolicitanteMenor");
    const minorBirthDate = new Date();
    minorBirthDate.setUTCFullYear(minorBirthDate.getUTCFullYear() - 10);
    const patient = await createPatientFixture({ birthDate: minorBirthDate });
    const custodian = await registerVerifiedDoctor("CustodioMenor");
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");

    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));
    expect(res.status).toBe(200);

    await waitFor(async () => {
      const log = await prisma.auditLog.findFirst({
        where: { action: "SHARE_NO_MATCH", patientId: patient.id, actorUserId: requester.userId },
      });
      return log !== null;
    });
    const noMatchLog = await prisma.auditLog.findFirst({ where: { action: "SHARE_NO_MATCH", patientId: patient.id, actorUserId: requester.userId } });
    expect((noMatchLog?.metadata as { reason?: string } | null)?.reason).toBe("minor_blocked");
    const createdCount = await prisma.recordShareRequest.count({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } });
    expect(createdCount).toBe(0);
  });

  it("no crea solicitud si el solicitante ya tiene relación de cuidado directa con el paciente", async () => {
    const requester = await registerVerifiedDoctor("YaRelacionado");
    const patient = await createPatientFixture();
    await careRelationshipService.createOrRenew(patient.id, requester.doctorId, "APPOINTMENT");
    const otherCustodian = await registerVerifiedDoctor("OtroCustodio");
    await careRelationshipService.createOrRenew(patient.id, otherCustodian.doctorId, "APPOINTMENT");

    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));
    expect(res.status).toBe(200);

    await waitFor(async () => (await prisma.auditLog.count({ where: { action: "SHARE_NO_MATCH", patientId: patient.id, actorUserId: requester.userId } })) > 0);
    const createdCount = await prisma.recordShareRequest.count({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } });
    expect(createdCount).toBe(0);
  });

  it("CA-4: respeta la espera de 7 días tras un rechazo, en silencio (sin error visible — RE5)", async () => {
    const requester = await registerVerifiedDoctor("TrasRechazo");
    const patient = await createPatientFixture();
    const custodian = await registerVerifiedDoctor("CustodioRechazo");
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");

    // Rechazo simulado hace 2 días (dentro de la ventana de 7).
    const priorRequest = await prisma.recordShareRequest.create({
      data: {
        requesterDoctorId: requester.doctorId,
        custodianDoctorId: custodian.doctorId,
        patientId: patient.id,
        reason: "Solicitud anterior, ya rechazada",
        requestedScope: ["SUMMARY"],
        requestedDurationDays: 30,
        status: "DENIED",
        linkTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    await prisma.recordShareConsent.create({
      data: {
        requestId: priorRequest.id,
        decision: "DENIED",
        approvedScope: [],
        durationDays: 30,
        consentTextVersion: "draft-2026-10-31",
        consentTextSha256: "0".repeat(64),
        channel: "EMAIL",
        decidedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    });

    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));
    expect(res.status).toBe(200);

    await waitFor(async () => {
      const log = await prisma.auditLog.findFirst({ where: { action: "SHARE_NO_MATCH", patientId: patient.id, actorUserId: requester.userId } });
      return (log?.metadata as { reason?: string } | null)?.reason === "recent_denial_cooldown";
    });
    // Solo existe la solicitud previa (ya rechazada) — ninguna nueva.
    const totalRequests = await prisma.recordShareRequest.count({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } });
    expect(totalRequests).toBe(1);
  });

  it("CA-3: aplica el límite de 20 solicitudes por día, con error visible y genérico", async () => {
    const requester = await registerVerifiedDoctor("LimiteDiario");
    // Siembra 20 eventos SHARE_REQUESTED de "hoy" sin hacer 20 llamadas
    // HTTP reales — el límite se verifica contando audit_log, así que
    // probar el conteo es probar la regla (ver record-share-request.service.ts).
    for (let i = 0; i < 20; i += 1) {
      await prisma.auditLog.create({
        data: { actorUserId: requester.userId, actorRole: "DOCTOR", action: "SHARE_REQUESTED", resourceType: "record_share_request", result: "SUCCESS" },
      });
    }

    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(await createPatientFixture()));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RECORD_SHARE_REQUEST_LIMIT_REACHED");
  });

  it("CA-7: todo evento queda en audit_log (incluida la solicitud base, antes de saber si hay coincidencia)", async () => {
    const requester = await registerVerifiedDoctor("Auditoria");
    const before = await prisma.auditLog.count({ where: { actorUserId: requester.userId, action: "SHARE_REQUESTED" } });
    const res = await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(await createPatientFixture()));
    expect(res.status).toBe(200);
    const after = await prisma.auditLog.count({ where: { actorUserId: requester.userId, action: "SHARE_REQUESTED" } });
    expect(after).toBeGreaterThan(before);
  });

  it("Mis solicitudes: solo devuelve las del médico que consulta, y cancelar funciona", async () => {
    const requester = await registerVerifiedDoctor("Bandeja");
    const patient = await createPatientFixture();
    const custodian = await registerVerifiedDoctor("CustodioBandeja");
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");

    await request(app.getHttpServer())
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(matchingRequestBody(patient));

    await waitFor(async () => (await prisma.recordShareRequest.count({ where: { requesterDoctorId: requester.doctorId, patientId: patient.id } })) === 1);

    const mine = await request(app.getHttpServer()).get("/record-share/requests/mine").set("Authorization", `Bearer ${requester.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    const requestId = mine.body[0].id as string;

    const otherDoctor = await registerVerifiedDoctor("Ajeno");
    const stolenCancel = await request(app.getHttpServer())
      .post(`/record-share/requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${otherDoctor.accessToken}`);
    expect(stolenCancel.status).toBe(400);

    const ownCancel = await request(app.getHttpServer())
      .post(`/record-share/requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${requester.accessToken}`);
    expect(ownCancel.status).toBe(200);

    const updated = await prisma.recordShareRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(updated.status).toBe("CANCELLED_BY_REQUESTER");
  });
});
