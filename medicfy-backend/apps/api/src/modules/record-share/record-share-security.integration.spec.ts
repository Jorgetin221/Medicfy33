import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ShareScope } from "@medicfy/contracts";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { mustGetEnv } from "../../config/must-get-env";
import { PrismaService } from "../../prisma/prisma.service";
import { CareRelationshipService } from "../scheduling/services/care-relationship.service";
import { TokenService } from "../identity/services/token.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "./record-share-notification.port";
import { ConsoleRecordShareNotificationAdapter } from "./console-record-share-notification.adapter";
import { RecordShareSweepService } from "./services/record-share-sweep.service";

/**
 * PR-EXP-07 — batería de seguridad contra Postgres real. UNA prueba por
 * línea de la batería del prompt maestro (B01…B17, mismo orden). La
 * parte que no necesita base (inspección de rutas/código, arranque en
 * producción del adaptador, captura de logs del adaptador) está en
 * record-share-security.spec.ts. Todo el flujo pasa por la API real:
 * solicitud → enlace → OTP → decisión → visor, nunca atajos en la base
 * salvo para fabricar el expediente clínico de prueba (R7: sintético).
 */
class RecordingNotificationAdapter implements RecordShareNotificationPort {
  public authorizationRequests: Array<{ destination: string; authorizationUrl: string }> = [];
  public otps: Array<{ destination: string; code: string }> = [];
  public revocationUrls: string[] = [];
  async sendAuthorizationRequest(input: { destination: string; authorizationUrl: string }): Promise<void> {
    this.authorizationRequests.push({ destination: input.destination, authorizationUrl: input.authorizationUrl });
  }
  async sendOtpCode(input: { destination: string; code: string }): Promise<void> {
    this.otps.push({ destination: input.destination, code: input.code });
  }
  async sendApprovalConfirmation(input: { revocationUrl: string }): Promise<void> {
    this.revocationUrls.push(input.revocationUrl);
  }
  async sendRevocationNotice(): Promise<void> {}
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const VIEWER_SECTIONS = ["", "/notes", "/results", "/prescriptions", "/study-orders"];
const ALL_SCOPES: ShareScope[] = ["SUMMARY", "SIGNED_NOTES", "RESULTS", "PRESCRIPTIONS", "STUDY_ORDERS"];

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}
function uniquePhone(): string {
  return `+52${Math.floor(1000000000 + Math.random() * 8999999999).toString()}`;
}
function uniqueCedula(): string {
  return Math.floor(10000000 + Math.random() * 89999999).toString();
}
// Nombre único por paciente: así ninguna coincidencia depende de lo
// que otras pruebas hayan dejado en la base de desarrollo.
function uniqueName(prefix: string): string {
  return `${prefix}${randomUUID().replace(/[^a-f]/g, "").slice(0, 8)}`;
}
async function waitFor<T>(probe: () => Promise<T | null | undefined> | T | null | undefined, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`waitFor: nada en ${timeoutMs}ms`);
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe("Expediente compartido — PR-EXP-07 batería de seguridad (integración)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let careRelationshipService: CareRelationshipService;
  let sweep: RecordShareSweepService;
  let notifications: RecordingNotificationAdapter;
  const appDb = new PrismaClient({ datasources: { db: { url: mustGetEnv("APP_DATABASE_URL") } } });

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
    sweep = moduleRef.get(RecordShareSweepService);
    await appDb.$connect();
  });

  afterAll(async () => {
    await appDb.$disconnect();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function registerDoctor(legalFirstName: string, verified = true) {
    const res = await http().post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName,
      legalLastName: "Bateria",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    if (verified) await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    return { userId, doctorId: doctor.id, accessToken: tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" }) };
  }

  async function createPatient(options: { birthDate?: Date } = {}) {
    return prisma.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: uniqueName("Paciente"),
        lastNamePaternal: "Bateria",
        birthDate: options.birthDate ?? new Date("1988-06-20"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        source: "CREATED_BY_DOCTOR",
      },
    });
  }

  type PatientRow = Awaited<ReturnType<typeof createPatient>>;

  function requestBody(patient: PatientRow, identity: Record<string, unknown> = {}, scope: ShareScope[] = ["SUMMARY"]) {
    return {
      patient: {
        firstName: patient.firstName,
        lastNamePaternal: patient.lastNamePaternal,
        birthDate: patient.birthDate.toISOString().slice(0, 10),
        email: patient.email,
        ...identity,
      },
      reason: "Valoración por dolor torácico y antecedentes cardiovasculares",
      scope,
      durationDays: 30,
    };
  }

  // Escenario base: custodio con vínculo, solicitante verificado, la
  // solicitud ya creada por la API y el enlace capturado.
  async function pendingShare(options: { scope?: ShareScope[]; patient?: PatientRow } = {}) {
    const custodian = await registerDoctor("Custodio");
    const requester = await registerDoctor("Solicitante");
    const patient = options.patient ?? (await createPatient());
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");
    const res = await http()
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(requestBody(patient, {}, options.scope ?? ["SUMMARY"]));
    expect(res.status).toBe(200);
    const sent = await waitFor(() => notifications.authorizationRequests.find((r) => r.destination === patient.email));
    const token = sent.authorizationUrl.split("/").at(-1) ?? "";
    return { custodian, requester, patient, token, authorizationUrl: sent.authorizationUrl };
  }

  async function verifyOtp(token: string) {
    await http().post(`/record-share/authorize/${token}/otp`).expect(200);
    const code = notifications.otps.at(-1)?.code;
    await http().post(`/record-share/authorize/${token}/otp/verify`).send({ code }).expect(200);
    return code ?? "";
  }

  async function approvedShare(options: { scope?: ShareScope[]; patient?: PatientRow; includedSensitiveCategories?: string[] } = {}) {
    const share = await pendingShare(options);
    await verifyOtp(share.token);
    await http()
      .post(`/record-share/authorize/${share.token}/decide`)
      .send({
        decision: "APPROVED",
        approvedScope: options.scope ?? ["SUMMARY"],
        includedSensitiveCategories: options.includedSensitiveCategories ?? [],
        pregnancyExcluded: false,
        durationDays: 30,
      })
      .expect(200);
    const grant = await prisma.recordShareGrant.findFirstOrThrow({
      where: { patientId: share.patient.id, requesterDoctorId: share.requester.doctorId, status: "ACTIVE" },
    });
    const revokeToken = notifications.revocationUrls.at(-1)?.split("/").at(-1) ?? "";
    return { ...share, grant, revokeToken };
  }

  // Expediente sintético (R7): un encuentro FIRMADO con nota + receta
  // + orden y los diagnósticos dados, y opcionalmente lo mismo en
  // BORRADOR. Directo en la base: lo que se prueba es lo que el visor
  // devuelve, no el flujo de firma (que tiene su propia suite).
  async function seedEncounter(patientId: string, doctorId: string, options: { signed: boolean; marker: string; icd10?: { code: string; description: string } }) {
    const encounter = await prisma.clinicalEncounter.create({ data: { patientId, doctorId, encounterType: "FOLLOW_UP" } });
    await prisma.clinicalNote.create({
      data: {
        encounterId: encounter.id,
        chiefComplaint: `Motivo ${options.marker}`,
        currentIllness: `Padecimiento ${options.marker}`,
        vitals: {},
        assessment: `Análisis ${options.marker}`,
        plan: `Plan ${options.marker}`,
      },
    });
    if (options.icd10) {
      await prisma.encounterDiagnosis.create({
        data: { encounterId: encounter.id, icd10Code: options.icd10.code, description: options.icd10.description, diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
      });
    }
    await prisma.prescription.create({
      data: {
        encounterId: encounter.id,
        patientId,
        doctorId,
        folio: `MDF-BAT-${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        doctorNameSnapshot: "Dra. Batería",
        doctorLicenseSnapshot: "1234567",
        practiceAddressSnapshot: "Consultorio sintético",
        patientNameSnapshot: "Paciente sintético",
        patientAgeSnapshot: 37,
        patientSexSnapshot: "F",
        diagnosisSnapshot: `Receta ${options.marker}`,
        signatureMethod: "INTERNAL_SYSTEM",
        signatureTimestamp: new Date(),
        contentHashSha256: "0".repeat(64),
        qrVerificationToken: randomUUID(),
      },
    });
    await prisma.labOrder.create({
      data: {
        encounterId: encounter.id,
        patientId,
        doctorId,
        folio: `MDF-BATL-${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        clinicalIndication: `Orden ${options.marker}`,
        signatureMethod: "INTERNAL_SYSTEM",
        signedAt: new Date(),
        contentHashSha256: "0".repeat(64),
        qrVerificationToken: randomUUID(),
      },
    });
    if (options.signed) {
      await prisma.clinicalEncounter.update({
        where: { id: encounter.id },
        data: { status: "SIGNED", signedAt: new Date(), contentHashSha256: "1".repeat(64) },
      });
    }
    return encounter;
  }

  async function viewAll(grantId: string, accessToken: string) {
    return Promise.all(VIEWER_SECTIONS.map((section) => http().get(`/record-share/grants/${grantId}${section}`).set("Authorization", `Bearer ${accessToken}`)));
  }

  it("B01 · sin enumeración: misma respuesta y mismo tiempo con y sin coincidencia", async () => {
    const { requester, patient } = await pendingShare();
    const timings = { match: [] as number[], noMatch: [] as number[] };
    const bodies = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      for (const kind of ["match", "noMatch"] as const) {
        const body = kind === "match" ? requestBody(patient) : requestBody(patient, { firstName: uniqueName("NoExiste"), email: uniqueEmail("nadie") });
        const start = performance.now();
        const res = await http().post("/record-share/requests").set("Authorization", `Bearer ${requester.accessToken}`).send(body);
        timings[kind].push(performance.now() - start);
        expect(res.status).toBe(200);
        bodies.add(JSON.stringify(res.body));
      }
    }
    expect(bodies.size).toBe(1);
    expect(Math.abs(median(timings.match) - median(timings.noMatch))).toBeLessThan(150);
  });

  it("B02 · el OTP va solo al contacto registrado, aunque el solicitante capture otro teléfono", async () => {
    const custodian = await registerDoctor("Custodio");
    const requester = await registerDoctor("Solicitante");
    const patient = await createPatient();
    await careRelationshipService.createOrRenew(patient.id, custodian.doctorId, "APPOINTMENT");
    const attackerPhone = uniquePhone();
    await http()
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${requester.accessToken}`)
      .send(requestBody(patient, { phone: attackerPhone }))
      .expect(200);

    const sent = await waitFor(() => notifications.authorizationRequests.find((r) => r.destination === patient.email));
    const token = sent.authorizationUrl.split("/").at(-1) ?? "";
    await http().post(`/record-share/authorize/${token}/otp`).expect(200);

    const destinations = [...notifications.authorizationRequests, ...notifications.otps].map((m) => m.destination);
    expect(destinations).not.toContain(attackerPhone);
    expect(notifications.otps.at(-1)?.destination).toBe(patient.email);
  });

  it("B03 · fuerza bruta de OTP: 5 fallos bloquean, incluso con el código correcto después", async () => {
    const { token } = await pendingShare();
    await http().post(`/record-share/authorize/${token}/otp`).expect(200);
    const code = notifications.otps.at(-1)?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      await http().post(`/record-share/authorize/${token}/otp/verify`).send({ code: wrong }).expect(400);
    }
    const locked = await http().post(`/record-share/authorize/${token}/otp/verify`).send({ code });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("RECORD_SHARE_OTP_LOCKED");
  });

  it("B04 · reutilización de OTP: falla", async () => {
    const { token } = await pendingShare();
    const code = await verifyOtp(token);
    const reuse = await http().post(`/record-share/authorize/${token}/otp/verify`).send({ code });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("RECORD_SHARE_OTP_INVALID");
  });

  it("B05 · reutilización o vencimiento del enlace: falla", async () => {
    const { token } = await approvedShare();
    for (const res of [
      await http().get(`/record-share/authorize/${token}`),
      await http().post(`/record-share/authorize/${token}/otp`),
      await http().post(`/record-share/authorize/${token}/decide`).send({ decision: "DENIED" }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("RECORD_SHARE_LINK_INVALID");
    }

    const second = await pendingShare();
    await prisma.recordShareRequest.updateMany({ where: { patientId: second.patient.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await http().get(`/record-share/authorize/${second.token}`);
    expect(expired.status).toBe(404);
  });

  it("B06 · ampliación de alcance o duración por manipulación de la API: falla y no crea grant", async () => {
    const { token, patient } = await pendingShare({ scope: ["SUMMARY"] });
    await verifyOtp(token);
    const base = { decision: "APPROVED", includedSensitiveCategories: [], pregnancyExcluded: false };
    const attempts = [
      { ...base, approvedScope: ["SUMMARY", "RESULTS"], durationDays: 30 },
      { ...base, approvedScope: ["SUMMARY"], durationDays: 90 },
      { ...base, approvedScope: ["SIGNED_NOTES"], durationDays: 30 },
    ];
    for (const body of attempts) {
      const res = await http().post(`/record-share/authorize/${token}/decide`).send(body);
      expect([400, 422]).toContain(res.status);
    }
    expect(await prisma.recordShareGrant.count({ where: { patientId: patient.id } })).toBe(0);
  });

  it("B07 · IDOR en TODOS los GET del visor", async () => {
    const { grant } = await approvedShare({ scope: ALL_SCOPES });
    const attacker = await registerDoctor("Ajeno");
    for (const res of await viewAll(grant.id, attacker.accessToken)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("RECORD_SHARE_ACCESS_DENIED");
    }
    const mine = await http().get("/record-share/grants/mine").set("Authorization", `Bearer ${attacker.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.map((g: { id: string }) => g.id)).not.toContain(grant.id);
    for (const res of await viewAll(randomUUID(), attacker.accessToken)) expect(res.status).toBe(403);
  });

  it("B08 · grant vencido, revocado o suspendido: 403 en el servidor en todas las secciones", async () => {
    for (const change of [
      { expiresAt: new Date(Date.now() - 1000) },
      { status: "REVOKED_BY_PATIENT" as const, revokedAt: new Date() },
      { status: "SUSPENDED_BY_ADMIN" as const, revokedAt: new Date() },
    ]) {
      const { grant, requester } = await approvedShare({ scope: ALL_SCOPES });
      await prisma.recordShareGrant.update({ where: { id: grant.id }, data: change });
      for (const res of await viewAll(grant.id, requester.accessToken)) expect(res.status).toBe(403);
    }
  });

  it("B09 · médico no verificado: no puede solicitar", async () => {
    const unverified = await registerDoctor("SinVerificar", false);
    const patient = await createPatient();
    const res = await http().post("/record-share/requests").set("Authorization", `Bearer ${unverified.accessToken}`).send(requestBody(patient));
    expect(res.status).toBe(403);
    expect(await prisma.recordShareRequest.count({ where: { patientId: patient.id } })).toBe(0);
  });

  it("B10 · menor sin tutor: bloqueado, sin solicitud ni mensaje", async () => {
    const custodian = await registerDoctor("Custodio");
    const requester = await registerDoctor("Solicitante");
    const minor = await createPatient({ birthDate: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000) });
    await careRelationshipService.createOrRenew(minor.id, custodian.doctorId, "APPOINTMENT");
    await http().post("/record-share/requests").set("Authorization", `Bearer ${requester.accessToken}`).send(requestBody(minor)).expect(200);
    const audit = await waitFor(() =>
      prisma.auditLog.findFirst({ where: { action: "SHARE_NO_MATCH", actorUserId: requester.userId, patientId: minor.id } })
    );
    expect(audit.metadata).toMatchObject({ reason: "minor_blocked" });
    expect(await prisma.recordShareRequest.count({ where: { patientId: minor.id } })).toBe(0);
    expect(notifications.authorizationRequests.some((r) => r.destination === minor.email)).toBe(false);
  });

  it("B11 · borradores: nunca visibles (notas, recetas y órdenes de un encuentro sin firmar)", async () => {
    const custodian = await registerDoctor("Custodio");
    const patient = await createPatient();
    await seedEncounter(patient.id, custodian.doctorId, { signed: true, marker: "FIRMADO" });
    await seedEncounter(patient.id, custodian.doctorId, { signed: false, marker: "BORRADOR" });
    const { grant, requester } = await approvedShare({ scope: ALL_SCOPES, patient });
    const responses = await viewAll(grant.id, requester.accessToken);
    for (const res of responses) expect(res.status).toBe(200);
    const payload = JSON.stringify(responses.map((r) => r.body));
    expect(payload).toContain("FIRMADO");
    expect(payload).not.toContain("BORRADOR");
  });

  it("B12 · sensibles: excluidas por defecto en todas las secciones, sin rastro", async () => {
    const custodian = await registerDoctor("Custodio");
    const patient = await createPatient();
    await seedEncounter(patient.id, custodian.doctorId, { signed: true, marker: "SENSIBLE", icd10: { code: "F32.1", description: "Episodio depresivo moderado" } });
    await seedEncounter(patient.id, custodian.doctorId, { signed: true, marker: "VISIBLE", icd10: { code: "E11.9", description: "Diabetes mellitus tipo 2" } });
    const { grant, requester } = await approvedShare({ scope: ALL_SCOPES, patient });
    const responses = await viewAll(grant.id, requester.accessToken);
    for (const res of responses) expect(res.status).toBe(200);
    const payload = JSON.stringify(responses.map((r) => r.body));
    expect(payload).toContain("E11.9");
    expect(payload).not.toMatch(/F32|depresivo|SENSIBLE/i);
    // Sin rastro: tampoco hay contadores ni marcas de "algo se ocultó".
    expect(payload).not.toMatch(/hidden|excluded|oculto|redact/i);
  });

  it("B13 · DELETE falla en todas las tablas nuevas; UPDATE falla en el consentimiento", async () => {
    const { grant } = await approvedShare();
    const consent = await prisma.recordShareConsent.findUniqueOrThrow({ where: { id: grant.consentId } });
    const challenge = await prisma.recordShareChallenge.findFirstOrThrow({ where: { requestId: consent.requestId } });
    await expect(appDb.$executeRaw`DELETE FROM record_share_requests WHERE id = ${consent.requestId}`).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRaw`DELETE FROM record_share_challenges WHERE id = ${challenge.id}`).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRaw`DELETE FROM record_share_consents WHERE id = ${consent.id}`).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRaw`DELETE FROM record_share_grants WHERE id = ${grant.id}`).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRaw`UPDATE record_share_consents SET "durationDays" = 90 WHERE id = ${consent.id}`).rejects.toThrow(/permission denied/i);
  });

  it("B14 · ningún dato personal en URL ni query string (enlaces generados)", async () => {
    const { authorizationUrl, patient, revokeToken } = await approvedShare();
    const revocationUrl = notifications.revocationUrls.at(-1) ?? "";
    for (const url of [authorizationUrl, revocationUrl]) {
      const parsed = new URL(url);
      expect(parsed.search).toBe("");
      expect(parsed.pathname).toMatch(/^\/expediente-compartido\/(autorizar|revocar)\/[A-Za-z0-9_-]{43}$/);
      for (const personal of [patient.firstName, patient.email, patient.phoneE164, patient.birthDate.toISOString().slice(0, 10), patient.id]) {
        expect(url).not.toContain(personal);
      }
    }
    expect(revokeToken).toHaveLength(43);
  });

  it("B15 · ningún OTP ni dato clínico/personal en logs de aplicación (flujo completo capturado)", async () => {
    const lines: string[] = [];
    const record = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const spies = [
      ...(["log", "error", "warn", "debug", "verbose"] as const).map((level) => vi.spyOn(Logger.prototype, level).mockImplementation(record)),
      vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
        lines.push(String(chunk));
        return true;
      }),
      vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
        lines.push(String(chunk));
        return true;
      }),
    ];
    try {
      const custodian = await registerDoctor("Custodio");
      const patient = await createPatient();
      await seedEncounter(patient.id, custodian.doctorId, { signed: true, marker: "CLINICO", icd10: { code: "E11.9", description: "Diabetes mellitus tipo 2" } });
      const { grant, requester } = await approvedShare({ scope: ALL_SCOPES, patient });
      await viewAll(grant.id, requester.accessToken);
      await http().post(`/record-share/authorize/${randomUUID()}/otp/verify`).send({ code: "123456" });
      await sweep.sweep();

      const joined = lines.join("\n");
      for (const otp of notifications.otps.map((o) => o.code)) expect(joined).not.toContain(otp);
      for (const forbidden of [patient.firstName, patient.email, patient.phoneE164, "Diabetes", "CLINICO"]) {
        expect(joined).not.toContain(forbidden);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("B16 · producción no arranca con el adaptador de notificación de desarrollo", async () => {
    // Se toma el proveedor REAL que AppModule cablea (sin override) y se
    // ejecuta su hook de arranque bajo NODE_ENV=production — no se
    // inicializa la app entera, porque otros módulos pueden fallar antes
    // por sus propias razones y esconderían si ESTE guardia funciona.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const port = moduleRef.get<RecordShareNotificationPort & { onModuleInit?: () => void }>(RECORD_SHARE_NOTIFICATION_PORT);
    expect(port).toBeInstanceOf(ConsoleRecordShareNotificationAdapter);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => port.onModuleInit?.()).toThrow(/D-EXP-13/);
    } finally {
      process.env.NODE_ENV = previous;
    }
    await moduleRef.close();
  });

  it("B17 · cada evento de PR-EXP-01 §6 aparece en audit_log", async () => {
    // Camino feliz completo + desvíos: no-match, OTP fallido/bloqueado,
    // rechazo, solicitud vencida, grant vencido, acceso denegado, abuso.
    const happy = await approvedShare({ scope: ALL_SCOPES });
    const requestId = (await prisma.recordShareConsent.findUniqueOrThrow({ where: { id: happy.grant.consentId } })).requestId;
    await http().get(`/record-share/grants/${happy.grant.id}`).set("Authorization", `Bearer ${happy.requester.accessToken}`).expect(200);
    await http()
      .post(`/record-share/patients/${happy.patient.id}/grants/${happy.grant.id}/report-abuse`)
      .set("Authorization", `Bearer ${happy.custodian.accessToken}`)
      .send({ reason: "Consultas fuera de contexto clínico reportadas en batería" })
      .expect(200);
    const outsider = await registerDoctor("Ajeno");
    await http().get(`/record-share/grants/${happy.grant.id}`).set("Authorization", `Bearer ${outsider.accessToken}`).expect(403);

    await http()
      .post("/record-share/requests")
      .set("Authorization", `Bearer ${happy.requester.accessToken}`)
      .send(requestBody(happy.patient, { firstName: uniqueName("NoExiste"), email: uniqueEmail("nadie") }))
      .expect(200);

    const locked = await pendingShare();
    await http().post(`/record-share/authorize/${locked.token}/otp`).expect(200);
    for (let i = 0; i < 5; i += 1) await http().post(`/record-share/authorize/${locked.token}/otp/verify`).send({ code: "000000" });

    const denied = await pendingShare();
    await verifyOtp(denied.token);
    await http().post(`/record-share/authorize/${denied.token}/decide`).send({ decision: "DENIED" }).expect(200);

    const stale = await pendingShare();
    await prisma.recordShareRequest.updateMany({ where: { patientId: stale.patient.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await sweep.sweep();

    const expiring = await approvedShare();
    await prisma.recordShareGrant.update({ where: { id: expiring.grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().get(`/record-share/grants/${expiring.grant.id}`).set("Authorization", `Bearer ${expiring.requester.accessToken}`).expect(403);

    const revoked = await approvedShare();
    await http().post(`/record-share/revoke/${revoked.revokeToken}/otp`).expect(200);
    await http().post(`/record-share/revoke/${revoked.revokeToken}/otp/verify`).send({ code: notifications.otps.at(-1)?.code }).expect(200);
    await http().post(`/record-share/revoke/${revoked.revokeToken}/revoke`).send({ grantId: revoked.grant.id }).expect(200);

    const lockedRequest = await prisma.recordShareRequest.findFirstOrThrow({ where: { patientId: locked.patient.id } });
    const deniedRequest = await prisma.recordShareRequest.findFirstOrThrow({ where: { patientId: denied.patient.id } });
    const staleRequest = await prisma.recordShareRequest.findFirstOrThrow({ where: { patientId: stale.patient.id } });

    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_REQUESTED", actorUserId: happy.requester.userId } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_NO_MATCH", actorUserId: happy.requester.userId } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_OTP_SENT", resourceId: requestId } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_OTP_FAILED", resourceId: lockedRequest.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_OTP_LOCKED", resourceId: lockedRequest.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_APPROVED", resourceId: requestId } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_DENIED", resourceId: deniedRequest.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_REQUEST_EXPIRED", resourceId: staleRequest.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_GRANT_EXPIRED", resourceId: expiring.grant.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_REVOKED", resourceId: revoked.grant.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_VIEWED", resourceId: happy.grant.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_ACCESS_DENIED", resourceId: happy.grant.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "SHARE_ABUSE_REPORTED", resourceId: happy.grant.id } })).not.toBeNull();
  });
});
