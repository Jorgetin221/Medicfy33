import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { TOTP, Secret } from "otpauth";
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
function totpFromUri(otpauthUri: string): string {
  const url = new URL(otpauthUri);
  const secret = url.searchParams.get("secret") as string;
  return new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const VALID_NOTE = {
  chiefComplaint: "Control de seguimiento",
  currentIllness: "Paciente en control.",
  vitals: {},
  assessment: "Evolución estable.",
  plan: "Continuar manejo actual.",
  diagnoses: [
    { description: "Control sano", codeAbsentReason: "Consulta de control sin patología que codificar.", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
  ],
};

// v2.5 · Capa 3 — sección de laboratorio congelada en la nota firmada.
describe("Capa 3 — note_lab_results, congelado al firmar (mismo patrón que vital_sign_sets)", () => {
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
      legalLastName: "Marín",
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
    const otpauthUri = start.body.otpauthUri as string;
    await request(app.getHttpServer()).post("/auth/mfa/enroll").set("Authorization", `Bearer ${accessToken}`).send({ code: totpFromUri(otpauthUri) });
    return otpauthUri;
  }

  async function createAdultPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ firstName: "Paciente", lastNamePaternal: "NotaLab", birthDate: "1985-06-01", sexAtBirth: "M", phoneE164: uniquePhone(), email: uniqueEmail("paciente") });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createDraftEncounter(accessToken: string, patientId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("un analito fuera de rango, seleccionado, se congela en la nota firmada con status=HIGH y su procedencia", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    const analyte = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ analyteName: "Glucosa", value: 250, unit: "mg/dL", referenceMin: 70, referenceMax: 99, measuredAt: "2026-08-01" });
    expect(analyte.status).toBe(201);

    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, labResultAnalyteIds: [analyte.body.id], password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(signed.status).toBe(201);

    const noteId = signed.body.note.id as string;
    const frozen = await prisma.noteLabResult.findMany({ where: { noteId } });
    expect(frozen).toHaveLength(1);
    expect(frozen[0]?.status).toBe("HIGH");
    expect(frozen[0]?.rangeSource).toBe("SHEET");
    expect(frozen[0]?.source).toBe("MANUAL");
    expect(Number(frozen[0]?.value)).toBe(250);

    const detail = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes[0].labResults).toHaveLength(1);
    expect(detail.body.notes[0].labResults[0].status).toBe("HIGH");
  });

  it("sin labResultAnalyteIds, la nota se firma normalmente y no crea ninguna fila de note_lab_results", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(signed.status).toBe(201);

    const frozen = await prisma.noteLabResult.findMany({ where: { noteId: signed.body.note.id } });
    expect(frozen).toHaveLength(0);
  });

  it("un id de analito de OTRO paciente en labResultAnalyteIds se ignora — nunca se congela en la nota de este paciente", async () => {
    const strangerDoctor = await registerDoctor();
    const strangerPatientId = await createAdultPatient(strangerDoctor.accessToken);
    const strangerAnalyte = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${strangerPatientId}`)
      .set("Authorization", `Bearer ${strangerDoctor.accessToken}`)
      .send({ analyteName: "Creatinina", value: 1.0, unit: "mg/dL", measuredAt: "2026-08-01" });
    expect(strangerAnalyte.status).toBe(201);

    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, labResultAnalyteIds: [strangerAnalyte.body.id], password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(signed.status).toBe(201);

    const frozen = await prisma.noteLabResult.findMany({ where: { noteId: signed.body.note.id } });
    expect(frozen).toHaveLength(0);
  });
});
