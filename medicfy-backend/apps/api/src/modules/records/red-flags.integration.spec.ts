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
};

// Fase 8 · Prompt 52 — banderas rojas: la RED DE SEGURIDAD determinista
// (independiente del modelo de IA). Verifica la integración completa:
// autoguardado dispara y persiste, dedup no duplica en autoguardados
// repetidos, el catálogo cerrado (Vía B) se resuelve por id, y firmar
// NUNCA se bloquea por una bandera activa (a diferencia del gate
// EXISTENTE de criticalVitalsConfirmed, que sí bloquea — son dos
// mecanismos distintos, con umbrales distintos).
describe("Banderas rojas — filtro de seguridad determinista (Prompt 52)", () => {
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

  async function createAdultPatient(accessToken: string, sexAtBirth: "F" | "M" = "M"): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "BanderaRoja",
        birthDate: "1990-01-01",
        sexAtBirth,
        phoneE164: uniquePhone(),
        email: uniqueEmail("paciente"),
      });
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

  it("un signo vital fuera de rango dispara la bandera en el autoguardado, y GET /red-flags la lista", async () => {
    const doctor = await registerDoctor();
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    const patched = await request(app.getHttpServer())
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ vitals: { spo2: 88 } });
    expect(patched.status).toBe(200);
    expect(patched.body.activeRedFlags.some((f: { flagCode: string }) => f.flagCode === "vital_hipoxemia")).toBe(true);

    const listed = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/red-flags`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].flagCode).toBe("vital_hipoxemia");
    expect(listed.body[0].urgency).toBe("inmediata");
  });

  it("dedup: la misma condición sigue vigente en varios autoguardados y NO crea filas duplicadas", async () => {
    const doctor = await registerDoctor();
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app.getHttpServer())
        .patch(`/records/encounters/${encounterId}/note`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ vitals: { spo2: 88 }, currentIllness: `actualización ${i}` });
      expect(res.status).toBe(200);
    }
    const rows = await prisma.redFlagEvent.findMany({ where: { encounterId } });
    expect(rows).toHaveLength(1);
  });

  it("Vía B: presentingSymptomTermIds resuelve contra el catálogo cerrado y dispara la bandera de síntoma correspondiente", async () => {
    const doctor = await registerDoctor();
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);
    const term = await prisma.clinicalCatalogTerm.findFirstOrThrow({
      where: { domain: "BANDERA_ROJA_SINTOMA", key: "cv_dolor_toracico_opresivo" },
    });

    const patched = await request(app.getHttpServer())
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ presentingSymptomTermIds: [term.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.activeRedFlags).toEqual([
      expect.objectContaining({ flagCode: "sintoma_cv_dolor_toracico_opresivo", detectionMethod: "SINTOMA" }),
    ]);
  });

  it("Vía B: un id de catálogo que no existe (o no es de este dominio) se ignora en silencio, sin romper el autoguardado", async () => {
    const doctor = await registerDoctor();
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    const patched = await request(app.getHttpServer())
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ presentingSymptomTermIds: [randomUUID()] });
    expect(patched.status).toBe(200);
    expect(patched.body.activeRedFlags).toEqual([]);
  });

  it("2.8 — ideación suicida sembrada en catálogo pero NUNCA dispara una bandera simple al firmarse como síntoma presente", async () => {
    const doctor = await registerDoctor();
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);
    const term = await prisma.clinicalCatalogTerm.findFirstOrThrow({
      where: { domain: "BANDERA_ROJA_SINTOMA", key: "salud_mental_ideacion_autolesion" },
    });

    const patched = await request(app.getHttpServer())
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ presentingSymptomTermIds: [term.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.activeRedFlags).toEqual([]);
  });

  it("NO bloquea la firma: un signo vital con bandera activa (umbral propio, distinto del gate existente de criticalVitalsConfirmed) permite firmar sin confirmación adicional", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createAdultPatient(doctor.accessToken);
    const encounterId = await createDraftEncounter(doctor.accessToken, patientId);

    // SpO2=88: dispara vital_hipoxemia (umbral <90 de este documento)
    // pero NO el gate crítico existente (vital-ranges.util.ts, <85) —
    // no debe pedir criticalVitalsConfirmed.
    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        ...VALID_NOTE,
        vitals: { spo2: 88 },
        diagnoses: [
          { description: "Control sano", codeAbsentReason: "Consulta de control sin patología que codificar.", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
        ],
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
      });
    expect(signed.status).toBe(201);
    expect(signed.body.activeRedFlags.some((f: { flagCode: string }) => f.flagCode === "vital_hipoxemia")).toBe(true);

    const encounterRow = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(encounterRow.status).toBe("SIGNED"); // la firma sí se completó — nada la bloqueó

    const listedAfterSign = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/red-flags`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(listedAfterSign.body.some((f: { flagCode: string }) => f.flagCode === "vital_hipoxemia")).toBe(true);
  });

  it("R4 — un médico sin vínculo con el paciente no puede listar banderas rojas del encuentro (403)", async () => {
    const owner = await registerDoctor();
    const patientId = await createAdultPatient(owner.accessToken);
    const encounterId = await createDraftEncounter(owner.accessToken, patientId);
    const stranger = await registerDoctor();

    const res = await request(app.getHttpServer())
      .get(`/records/encounters/${encounterId}/red-flags`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });
});
