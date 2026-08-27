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

function mustGetField(
  data: Record<string, { value: number; interpretation?: string }>,
  fieldKey: string
): { value: number; interpretation?: string } {
  const field = data[fieldKey];
  if (!field) {
    throw new Error(`expected specialtyData to contain ${fieldKey}`);
  }
  return field;
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// Motor de escalas sobre SpecialtyFieldSchema/EncounterSpecialtyData
// (M8-RN-014) — existían completos en el esquema, cero código los
// usaba. Sembrado en prisma/seed.ts: Glasgow + Apgar (1min/5min).
describe("Motor de escalas clínicas (Glasgow, Apgar) sobre SpecialtyFieldSchema", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

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
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Sofía",
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
        lastNamePaternal: "Escalas",
        birthDate: "1990-05-15",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createEncounter(accessToken: string, patientId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function baseSignPayload(specialtyData?: Record<string, number>) {
    return {
      chiefComplaint: "Control",
      currentIllness: "Sin datos de alarma",
      vitals: {},
      assessment: "Sin hallazgos",
      plan: "Control",
      diagnoses: [{ icd10Code: "Z00.0", description: "Examen médico general", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
      ...(specialtyData ? { specialtyData } : {}),
    };
  }

  it("GET /specialty-field-schemas?section=ESCALAS regresa los 16 campos sembrados, requiere sesión pero no care_relationship", async () => {
    const anonymous = await request(app.getHttpServer()).get("/specialty-field-schemas?section=ESCALAS");
    expect(anonymous.status).toBe(401);

    const doctor = await registerDoctor();
    const res = await request(app.getHttpServer())
      .get("/specialty-field-schemas?section=ESCALAS")
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(16);
    expect(res.body.some((f: { fieldKey: string }) => f.fieldKey === "glasgow_total")).toBe(true);
  });

  it("rechaza una sección inválida (400)", async () => {
    const doctor = await registerDoctor();
    const res = await request(app.getHttpServer())
      .get("/specialty-field-schemas?section=NO_EXISTE")
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(res.status).toBe(400);
  });

  it("Glasgow 4+5+6 firma con glasgow_total=15 e interpretación Leve, protegido por el hash de la nota", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(baseSignPayload({ glasgow_ocular: 4, glasgow_verbal: 5, glasgow_motora: 6 }));
    expect(signed.status).toBe(201);

    const stored = await prisma.encounterSpecialtyData.findUniqueOrThrow({ where: { encounterId } });
    const data = stored.data as Record<string, { value: number; interpretation?: string }>;
    expect(mustGetField(data, "glasgow_total").value).toBe(15);
    expect(mustGetField(data, "glasgow_total").interpretation).toBe("Leve");
    expect(mustGetField(data, "glasgow_ocular").value).toBe(4);
    expect(stored.specialtySchemaVersion).toBe(1);
  });

  it("Apgar bajo al minuto 1 da interpretación de depresión severa, y sin escalas la firma sigue funcionando igual que siempre", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const encounterWithApgar = await createEncounter(doctor.accessToken, patientId);
    const signedLow = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterWithApgar}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(
        baseSignPayload({
          apgar_1min_apariencia: 0,
          apgar_1min_pulso: 1,
          apgar_1min_gesticulacion: 0,
          apgar_1min_actividad: 0,
          apgar_1min_respiracion: 0,
        })
      );
    expect(signedLow.status).toBe(201);
    const storedLow = await prisma.encounterSpecialtyData.findUniqueOrThrow({ where: { encounterId: encounterWithApgar } });
    const dataLow = storedLow.data as Record<string, { value: number; interpretation?: string }>;
    expect(mustGetField(dataLow, "apgar_total_1min").value).toBe(1);
    expect(mustGetField(dataLow, "apgar_total_1min").interpretation).toBe("Depresión severa");

    // Regresión: firmar sin specialtyData en absoluto sigue igual que
    // antes de que existiera el motor de escalas.
    const encounterWithoutScales = await createEncounter(doctor.accessToken, patientId);
    const signedPlain = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterWithoutScales}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(baseSignPayload());
    expect(signedPlain.status).toBe(201);
    const noSpecialtyRow = await prisma.encounterSpecialtyData.findUnique({ where: { encounterId: encounterWithoutScales } });
    expect(noSpecialtyRow).toBeNull();
  });

  it("rechaza un valor fuera de rango con 400 y no firma la nota", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(baseSignPayload({ glasgow_ocular: 9, glasgow_verbal: 5, glasgow_motora: 6 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SCALE_VALUE_OUT_OF_RANGE");

    const encounter = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(encounter.status).toBe("DRAFT");
  });

  it("una escala incompleta no calcula un total parcial, pero guarda los valores crudos que sí llegaron", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(baseSignPayload({ glasgow_ocular: 4, glasgow_verbal: 5 }));
    expect(signed.status).toBe(201);

    const stored = await prisma.encounterSpecialtyData.findUniqueOrThrow({ where: { encounterId } });
    const data = stored.data as Record<string, { value: number; interpretation?: string }>;
    expect(mustGetField(data, "glasgow_ocular").value).toBe(4);
    expect(mustGetField(data, "glasgow_verbal").value).toBe(5);
    expect(data.glasgow_total).toBeUndefined();
  });
});
