import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { TOTP, Secret } from "otpauth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaClient } from "@prisma/client";
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
  return `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`;
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
const BASE_NOTE = {
  chiefComplaint: "Control clínico",
  currentIllness: "Paciente en seguimiento, sin datos de alarma.",
  assessment: "Evolución estable.",
  plan: "Continuar manejo.",
};

// Fase 3 (prompts 25-31) — pruebas literales del prompt 31B (la 31.5,
// exportación FHIR validada, está DIFERIDA por decisión previa de
// Jorge, registrada en el ESTADO; el resto se ejercita completo).
describe("Fase 3 · La nota como datos (prompt 31B)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  // El alta de una escala es CONFIGURACIÓN (owner de la BD), no
  // captura: medicfy_app solo tiene SELECT sobre specialty_field_schemas.
  const ownerDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "" } } });

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
  });

  afterAll(async () => {
    await ownerDb.$disconnect();
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "Fase3",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    return { userId, accessToken: tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" }) };
  }

  // sign() ahora llama a SignatureVerificationService.verify() como lo
  // primero que hace — a diferencia de signAccessToken() (bypass de
  // sesión), la contraseña real y el TOTP real no se pueden saltar.
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

  async function createPatient(accessToken: string, birthDate: string, sexAtBirth: "F" | "M" = "F"): Promise<string> {
    const ageYears = (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "NotaDatos",
        birthDate,
        sexAtBirth,
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        // M5: un menor exige tutor registrado.
        ...(ageYears < 18
          ? {
              guardian: {
                guardianName: "Tutora de Prueba",
                guardianRelation: "MADRE",
                guardianPhoneE164: uniquePhone(),
                guardianEmail: uniqueEmail("tutora"),
                guardianIdDocumentKey: `zztest-id-${randomUUID().slice(0, 8)}`,
              },
            }
          : {}),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function icd10(): Promise<string> {
    return (await prisma.icd10Code.findFirstOrThrow()).code;
  }

  async function signNote(
    accessToken: string,
    otpauthUri: string,
    patientId: string,
    extra: Record<string, unknown>
  ): Promise<{ status: number; body: { error: { code: string; details: { criticalFields: string[] } } } & Record<string, unknown> }> {
    const enc = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    expect(enc.status).toBe(201);
    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${enc.body.id}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...BASE_NOTE,
        diagnoses: [{ icd10Code: await icd10(), description: "Control", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
        ...extra,
      });
    return { status: res.status, body: res.body };
  }

  it("31.1 — la presión arterial de las últimas doce consultas se grafica sin procesar texto", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");

    for (let i = 0; i < 12; i += 1) {
      const res = await signNote(doctor.accessToken, otpauthUri, patientId, {
        vitals: { bpSystolic: 110 + i, bpDiastolic: 70 + i },
      });
      expect(res.status).toBe(201);
    }

    const history = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/vitals-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(12);
    // Números tipados de columnas — jamás parseo de cadenas.
    for (const [i, row] of history.body.entries()) {
      expect(typeof row.bpSystolicMmHg).toBe("number");
      expect(row.bpSystolicMmHg).toBe(110 + i);
      expect(row.bpDiastolicMmHg).toBe(70 + i);
    }
  });

  it("31.2 — peso y talla producen IMC del servidor (78.4 kg / 1.58 m → 31.4); un IMC enviado por el cliente se IGNORA", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");

    const res = await signNote(doctor.accessToken, otpauthUri, patientId, {
      // El cliente intenta imponer un IMC falso: se ignora y recalcula.
      vitals: { weightKg: 78.4, heightCm: 158, bmi: 99.9, bsaM2: 9.99 },
    });
    expect(res.status).toBe(201);
    const vitalsRow = await prisma.vitalSignSet.findFirstOrThrow({ where: { patientId } });
    expect(Number(vitalsRow.bmi)).toBe(31.4);
    // Superficie corporal por Mosteller: √(158·78.4/3600) = 1.85 m².
    expect(Number(vitalsRow.bsaM2)).toBeCloseTo(1.85, 2);
    expect(vitalsRow.bsaFormula).toContain("Mosteller");
  });

  it("31.3 — una saturación de 78% exige confirmación explícita antes de permitir firmar", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");

    const blocked = await signNote(doctor.accessToken, otpauthUri, patientId, { vitals: { spo2: 78 } });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("VITALS_CRITICAL_CONFIRMATION_REQUIRED");
    expect(blocked.body.error.details.criticalFields).toContain("spo2");

    const confirmed = await signNote(doctor.accessToken, otpauthUri, patientId, {
      vitals: { spo2: 78 },
      criticalVitalsConfirmed: true,
    });
    expect(confirmed.status).toBe(201);
    const vitalsRow = await prisma.vitalSignSet.findFirstOrThrow({ where: { patientId } });
    expect(vitalsRow.criticalFlags).toContain("spo2");
  });

  it("31.4 — dar de alta una escala nueva POR CONFIGURACIÓN la hace disponible en la nota sin desplegar código", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");

    // Alta como DATOS (lo que haría un despliegue de configuración).
    const suffix = randomUUID().slice(0, 6);
    const itemKey = `zztest_escala_${suffix}`;
    const totalKey = `zztest_escala_total_${suffix}`;
    await ownerDb.specialtyFieldSchema.createMany({
      data: [
        { specialtyId: null, version: 1, section: "ESCALAS", fieldKey: itemKey, label: "ZZTEST reactivo", inputType: "NUMBER", minValue: 0, maxValue: 10, displayOrder: 900, publishedAt: new Date() },
        { specialtyId: null, version: 1, section: "ESCALAS", fieldKey: totalKey, label: "ZZTEST total", inputType: "COMPUTED", computedFormula: itemKey, options: [{ min: 0, max: 5, label: "Bajo" }, { min: 6, max: 10, label: "Alto" }], displayOrder: 901, publishedAt: new Date() },
      ],
    });

    // Disponible en el contrato de pantalla…
    const schemas = await request(app.getHttpServer())
      .get("/specialty-field-schemas?section=ESCALAS")
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(schemas.status).toBe(200);
    expect(JSON.stringify(schemas.body)).toContain(itemKey);

    // …y usable al firmar: el servidor computa el total e interpreta.
    const res = await signNote(doctor.accessToken, otpauthUri, patientId, {
      vitals: {},
      specialtyData: { [itemKey]: 8 },
    });
    expect(res.status).toBe(201);
    const specialtyData = await prisma.encounterSpecialtyData.findFirstOrThrow({
      where: { encounter: { patientId } },
      orderBy: { createdAt: "desc" },
    });
    const data = specialtyData.data as Record<string, { value: number; interpretation?: string }>;
    expect(data[totalKey]?.value).toBe(8);
    expect(data[totalKey]?.interpretation).toBe("Alto");
  });

  it("31.6 — en pediatría, peso y talla producen la percentila correspondiente a la edad (LMS OMS): mediana → P50", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    // Paciente de ~12 meses (niño): la mediana OMS de peso es 9.6479 kg.
    const birth = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const patientId = await createPatient(doctor.accessToken, birth, "M");

    const res = await signNote(doctor.accessToken, otpauthUri, patientId, {
      vitals: { weightKg: 9.65, heightCm: 75.7 },
    });
    expect(res.status).toBe(201);
    const vitalsRow = await prisma.vitalSignSet.findFirstOrThrow({ where: { patientId } });
    // Peso en la mediana OMS → percentil ~50 (tolerancia por el mes
    // más cercano y el redondeo del peso).
    expect(Number(vitalsRow.weightPercentile)).toBeGreaterThan(35);
    expect(Number(vitalsRow.weightPercentile)).toBeLessThan(65);
    expect(vitalsRow.percentileSource).toContain("OMS_2006");
    expect(Number(vitalsRow.heightPercentile)).toBeGreaterThan(0);
  });

  it("Prompt 28 — un código CIE-10 inexistente ya no puede firmarse (FK real); descartar saca de vigentes sin borrar", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");

    // Código inventado → 422 (P4 §2.4: antes quedaba firmado y hasheado).
    const enc = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    const invalid = await request(app.getHttpServer())
      .post(`/records/encounters/${enc.body.id}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...BASE_NOTE,
        vitals: {},
        diagnoses: [{ icd10Code: "ZZZZ9", description: "Inventado", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("DIAGNOSIS_ICD10_NOT_IN_CATALOG");

    // Firma válida → vigente; descartar → sale de vigentes, fila viva.
    const code = await icd10();
    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${enc.body.id}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...BASE_NOTE,
        vitals: {},
        diagnoses: [{ icd10Code: code, description: "Real", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
      });
    expect(signed.status).toBe(201);
    const diagnosis = await prisma.encounterDiagnosis.findFirstOrThrow({ where: { encounterId: enc.body.id } });
    expect(diagnosis.icd10CodeId).toBe(code);

    const before = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/active-diagnoses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(before.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/diagnoses/${diagnosis.id}/discard`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/active-diagnoses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(after.body).toHaveLength(0);

    const survivor = await prisma.encounterDiagnosis.findUniqueOrThrow({ where: { id: diagnosis.id } });
    expect(survivor.certainty).toBe("DESCARTADO");
    expect(survivor.discardedByUserId).toBe(doctor.userId);
    expect(survivor.discardedAt).toBeInstanceOf(Date);
  });

  it("Prompt 25 — la nota firmada queda tipada: tipo de nota del catálogo (TIPO_NOTA) y especialidad del autor, fijados por el servidor", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "1990-01-01");
    const res = await signNote(doctor.accessToken, otpauthUri, patientId, { vitals: {} });
    expect(res.status).toBe(201);

    const note = await prisma.clinicalNote.findFirstOrThrow({
      where: { encounter: { patientId } },
      include: { noteTypeTerm: true },
    });
    expect(note.noteTypeTerm?.key).toBe("ne"); // FOLLOW_UP → nota de evolución
    expect(note.specialtyCode).toBe("GENERAL");
  });
});
