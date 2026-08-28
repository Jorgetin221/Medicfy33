import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";
import { TOTP, Secret } from "otpauth";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { mustGetEnv } from "../../config/must-get-env";
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
function totpFromUri(otpauthUri: string): string {
  const url = new URL(otpauthUri);
  const secret = url.searchParams.get("secret") as string;
  return new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

const SIGN_BODY_BASE = {
  vitals: {},
  diagnoses: [{ description: "Diagnóstico de prueba", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED", codeAbsentReason: "Sin código disponible para esta prueba" }],
};

// Fase 6 · Prompt 45 — "sello de integridad ... verificable de forma
// independiente" y "bitácora de acceso consultable". El hash chain
// (contentHashSha256/previousHashSha256) ya se calculaba al firmar
// desde antes de esta fase; lo nuevo es RELEERLO y recalcularlo desde
// lo guardado, y exponer audit_log para lectura. La prueba de
// integridad altera una nota DIRECTO en la base con el rol dueño del
// esquema (jorgetinoco), nunca a través de la app — es la única forma
// honesta de probar "sin confiar en el sistema que la guardó".
describe("Integridad de la cadena de firmas y bitácora de acceso", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  const ownerDb = new PrismaClient({ datasources: { db: { url: mustGetEnv("DATABASE_URL") } } });

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
    await ownerDb.$connect();
  });

  afterAll(async () => {
    await ownerDb.$disconnect();
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Gustavo",
      legalLastName: "Peña",
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

  async function enrollMfa(accessToken: string): Promise<string> {
    const start = await request(app.getHttpServer()).post("/auth/mfa/enroll").set("Authorization", `Bearer ${accessToken}`).send({});
    expect(start.status).toBe(200);
    const otpauthUri = start.body.otpauthUri as string;
    const confirm = await request(app.getHttpServer())
      .post("/auth/mfa/enroll")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: totpFromUri(otpauthUri) });
    expect(confirm.status).toBe(200);
    return otpauthUri;
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Integridad",
        birthDate: "1988-05-05",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function signNewNote(
    accessToken: string,
    patientId: string,
    otpauthUri: string,
    seq: number
  ): Promise<{ encounterId: string; noteId: string }> {
    const encounter = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    expect(encounter.status).toBe(201);
    const encounterId = encounter.body.id as string;

    const sign = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...SIGN_BODY_BASE,
        chiefComplaint: `Motivo de prueba #${seq}`,
        currentIllness: `Padecimiento de prueba #${seq}`,
        assessment: `Análisis de prueba #${seq}`,
        plan: `Plan de prueba #${seq}`,
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
      });
    expect(sign.status).toBe(201);
    return { encounterId, noteId: sign.body.note.id as string };
  }

  it("tres notas firmadas en cadena verifican OK, y alterar la de en medio DIRECTO en la base (sin pasar por la app) se detecta sin tocar las otras dos", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);

    const first = await signNewNote(doctor.accessToken, patientId, otpauthUri, 1);
    const middle = await signNewNote(doctor.accessToken, patientId, otpauthUri, 2);
    const last = await signNewNote(doctor.accessToken, patientId, otpauthUri, 3);

    const before = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/integrity-check`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(before.status).toBe(200);
    expect(before.body).toHaveLength(3);
    expect(before.body.every((r: { status: string }) => r.status === "OK")).toBe(true);

    // Alteración directa como dueño del esquema (jorgetinoco) — la app
    // (medicfy_app) NO PUEDE hacer esto (ver append-only.integration.spec.ts).
    // Solo cambia el CONTENIDO, no la columna contentHashSha256 —
    // exactamente lo que un ataque directo a la base haría sin conocer
    // el algoritmo de hash.
    await ownerDb.$executeRaw`UPDATE clinical_notes SET plan = 'PLAN ALTERADO SIN AUTORIZACION' WHERE id = ${middle.noteId}`;

    const after = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/integrity-check`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(after.status).toBe(200);

    const results: { encounterId: string; status: string; reasons: string[] }[] = after.body;
    const firstResult = results.find((r) => r.encounterId === first.encounterId);
    const middleResult = results.find((r) => r.encounterId === middle.encounterId);
    const lastResult = results.find((r) => r.encounterId === last.encounterId);

    expect(firstResult?.status).toBe("OK");
    expect(middleResult?.status).toBe("ALTERADA");
    expect(middleResult?.reasons.length).toBeGreaterThan(0);
    // La nota siguiente (nunca tocada) sigue íntegra en sí misma — la
    // alteración es asunto de la nota de en medio.
    expect(lastResult?.status).toBe("OK");
  });

  it("cada lectura clínica del expediente queda reflejada en la bitácora de acceso del paciente, incluida la del propio médico tratante", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const read = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(read.status).toBe(200);

    const log = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/access-log`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(log.status).toBe(200);
    expect(log.body.some((e: { action: string; actorUserId: string }) => e.action === "records.allergies.list" && e.actorUserId === doctor.userId)).toBe(
      true
    );
  });

  it("GET /doctors/me/patient-access-log agrega la bitácora de todos los pacientes con vínculo activo del médico", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);

    const panel = await request(app.getHttpServer())
      .get("/doctors/me/patient-access-log")
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(panel.status).toBe(200);
    expect(panel.body.some((e: { patientId: string | null }) => e.patientId === patientId)).toBe(true);
  });

  it("un médico sin ningún paciente con vínculo activo recibe una bitácora vacía, no la de todos los pacientes de la app", async () => {
    const doctor = await registerDoctor();
    const panel = await request(app.getHttpServer())
      .get("/doctors/me/patient-access-log")
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(panel.status).toBe(200);
    expect(panel.body).toEqual([]);
  });
});
