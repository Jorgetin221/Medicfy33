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
const VALID_NOTE = {
  chiefComplaint: "Dolor abdominal difuso",
  currentIllness: "Paciente refiere dolor abdominal de 2 días de evolución, sin datos de alarma.",
  vitals: {},
  assessment: "Cuadro inespecífico, estudios en proceso.",
  plan: "Solicitar laboratorios generales, control en 48h.",
};

// M8-RN-006 dice "texto libre permitido como complemento, nunca como
// sustituto" — a petición explícita del usuario (2026-08-24, confirmó
// apartarse de la regla a sabiendas), existe una segunda ruta:
// diagnóstico sin icd10Code pero con codeAbsentReason obligatorio.
// Exactamente uno de los dos siempre, nunca ambos ni ninguno.
describe("Diagnóstico sin código CIE-10 (segunda ruta de M8-RN-006)", () => {
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
    const email = uniqueEmail("doctor");
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email,
      password: STRONG_PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "Cruz",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    // DoctorVerifiedGuard (M1-RN-002) ahora protege encounters.sign.
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
        lastNamePaternal: "SinCie10",
        birthDate: "1992-07-04",
        sexAtBirth: "M",
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

  it("firma con un diagnóstico sin código CIE-10 y razón válida — persiste codeAbsentReason, icd10Code queda null", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...VALID_NOTE,
        diagnoses: [
          {
            description: "Dolor abdominal en estudio",
            codeAbsentReason: "Cuadro inespecífico, estudios de laboratorio e imagen aún pendientes.",
            diagnosisType: "PRINCIPAL",
            certainty: "SUSPECTED",
          },
        ],
      });

    expect(res.status).toBe(201);
    const diagnosis = await prisma.encounterDiagnosis.findFirstOrThrow({ where: { encounterId } });
    expect(diagnosis.icd10Code).toBeNull();
    expect(diagnosis.codeAbsentReason).toBe("Cuadro inespecífico, estudios de laboratorio e imagen aún pendientes.");
  });

  it("rechaza con 400 si el diagnóstico trae icd10Code Y codeAbsentReason a la vez", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);
    const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...VALID_NOTE,
        diagnoses: [
          {
            description: "Dx",
            icd10Code,
            codeAbsentReason: "Esto no debería poder mandarse junto con un código real.",
            diagnosisType: "PRINCIPAL",
            certainty: "CONFIRMED",
          },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("rechaza con 400 si el diagnóstico no trae ni icd10Code ni codeAbsentReason", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, diagnoses: [{ description: "Dx", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }] });

    expect(res.status).toBe(400);
  });

  it("rechaza con 400 si codeAbsentReason tiene menos de 10 caracteres", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...VALID_NOTE,
        diagnoses: [{ description: "Dx", codeAbsentReason: "muy corto", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
      });

    expect(res.status).toBe(400);
  });

  it("la ruta con código CIE-10 sigue funcionando exactamente igual que antes", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);
    const icd10 = await prisma.icd10Code.findFirstOrThrow();

    const res = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...VALID_NOTE,
        diagnoses: [{ icd10Code: icd10.code, description: icd10.description, diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
      });

    expect(res.status).toBe(201);
    const diagnosis = await prisma.encounterDiagnosis.findFirstOrThrow({ where: { encounterId } });
    expect(diagnosis.icd10Code).toBe(icd10.code);
    expect(diagnosis.codeAbsentReason).toBeNull();
  });
});
