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
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const VALID_NOTE = {
  chiefComplaint: "Control de seguimiento",
  currentIllness: "Paciente en control, sin datos de alarma.",
  vitals: {},
  assessment: "Evolución estable.",
  plan: "Continuar manejo actual, control en 4 semanas.",
};

// Fase 1 — Zona 1 de DOC-06: #18 embarazo y #19 diagnósticos vigentes.
describe("Fase 1 · Zona 1 — embarazo (#18) y diagnósticos vigentes (#19)", () => {
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

  async function createPatient(accessToken: string, sexAtBirth: "F" | "M"): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Fase1",
        birthDate: "1994-03-15",
        sexAtBirth,
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function signEncounterWithDiagnoses(
    accessToken: string,
    patientId: string,
    diagnoses: Record<string, unknown>[]
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, encounterType: "FOLLOW_UP" });
    expect(created.status).toBe(201);
    const encounterId = created.body.id as string;
    const signed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...VALID_NOTE, diagnoses });
    expect(signed.status).toBe(201);
    return encounterId;
  }

  describe("#18 — embarazo", () => {
    it("crea con FUM: el servidor deriva FPP = FUM+280 (método FUM) y las SDG al leer; nada de eso viaja del cliente", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");
      const lmp = isoDaysAgo(10 * 7); // FUM hace 10 semanas exactas

      const created = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: lmp });
      expect(created.status).toBe(201);
      expect(created.body.eddMethod).toBe("FUM");
      const expectedEdd = new Date(new Date(lmp).getTime() + 280 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(String(created.body.eddDate).slice(0, 10)).toBe(expectedEdd);
      // SDG ~ 10 semanas (la aritmética de medianoche puede mover ±1 día)
      expect(created.body.gestationalAge.weeks).toBeGreaterThanOrEqual(9);
      expect(created.body.gestationalAge.weeks).toBeLessThanOrEqual(10);

      const fetched = await request(app.getHttpServer())
        .get(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.pregnancy.id).toBe(created.body.id);
      expect(fetched.body.pregnancy.gestationalAge).toBeDefined();
    });

    it("FPP capturada explícitamente = datación por ULTRASONIDO, y una FUM tardía no la degrada", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");
      const eddByUsg = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const created = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ eddDate: eddByUsg });
      expect(created.status).toBe(201);
      expect(created.body.eddMethod).toBe("ULTRASONIDO");

      // La paciente recuerda su FUM después: se guarda, pero la FPP por
      // ultrasonido se conserva.
      const patched = await request(app.getHttpServer())
        .patch(`/records/patients/${patientId}/pregnancy/${created.body.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: isoDaysAgo(100) });
      expect(patched.status).toBe(200);
      expect(patched.body.eddMethod).toBe("ULTRASONIDO");
      expect(String(patched.body.eddDate).slice(0, 10)).toBe(eddByUsg);
      expect(patched.body.lmpDate).not.toBeNull();
    });

    it("un solo embarazo ACTIVE por paciente (409 en el segundo); cerrar libera y permite registrar uno nuevo — la fila cerrada sobrevive", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");

      const first = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: isoDaysAgo(30) });
      expect(first.status).toBe(201);

      const duplicate = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: isoDaysAgo(20) });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("PREGNANCY_ALREADY_ACTIVE");

      const closed = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy/${first.body.id}/close`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(closed.status).toBe(201);
      expect(closed.body.status).toBe("CLOSED");

      // GET ya no regresa activo; la fila cerrada sigue existiendo.
      const after = await request(app.getHttpServer())
        .get(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(after.body.pregnancy).toBeNull();
      const row = await prisma.patientPregnancy.findUniqueOrThrow({ where: { id: first.body.id } });
      expect(row.status).toBe("CLOSED");

      const second = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: isoDaysAgo(5) });
      expect(second.status).toBe(201);
    });

    it("rechaza registrar embarazo con sexo al nacer M (422) y sin FUM ni FPP (400)", async () => {
      const doctor = await registerDoctor();
      const malePatientId = await createPatient(doctor.accessToken, "M");

      const male = await request(app.getHttpServer())
        .post(`/records/patients/${malePatientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ lmpDate: isoDaysAgo(30) });
      expect(male.status).toBe(422);
      expect(male.body.error.code).toBe("PREGNANCY_REQUIRES_FEMALE_SEX_AT_BIRTH");

      const femalePatientId = await createPatient(doctor.accessToken, "F");
      const empty = await request(app.getHttpServer())
        .post(`/records/patients/${femalePatientId}/pregnancy`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({});
      expect(empty.status).toBe(400);
    });

    it("R4 — prueba negativa: un médico sin vínculo no lee ni escribe el embarazo de una paciente ajena (403)", async () => {
      const owner = await registerDoctor();
      const patientId = await createPatient(owner.accessToken, "F");
      const stranger = await registerDoctor();

      const read = await request(app.getHttpServer())
        .get(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${stranger.accessToken}`);
      expect(read.status).toBe(403);

      const write = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/pregnancy`)
        .set("Authorization", `Bearer ${stranger.accessToken}`)
        .send({ lmpDate: isoDaysAgo(30) });
      expect(write.status).toBe(403);
    });

    it("R1 — DELETE sobre patient_pregnancies está revocado para medicfy_app", async () => {
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "patient_pregnancies" WHERE id = 'no-existe'`)).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("M8-RN-013 — tiempo abrir→firmar", () => {
    it("al firmar, el servidor fija timeToSignSeconds = signedAt - startedAt (la métrica del negocio, nunca del cliente)", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");
      const encounterId = await signEncounterWithDiagnoses(doctor.accessToken, patientId, [
        {
          description: "Control sano",
          codeAbsentReason: "Consulta de control sin patología que codificar.",
          diagnosisType: "PRINCIPAL",
          certainty: "CONFIRMED",
        },
      ]);
      const row = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
      expect(row.timeToSignSeconds).not.toBeNull();
      const expected = Math.round(((row.signedAt as Date).getTime() - row.startedAt.getTime()) / 1000);
      expect(row.timeToSignSeconds).toBe(expected);
      expect(row.timeToSignSeconds).toBeGreaterThanOrEqual(0);
      expect(row.timeToSignSeconds).toBeLessThan(60); // la prueba tarda segundos, no minutos
    });
  });

  describe("#19 — diagnósticos vigentes", () => {
    it("deduplica por CIE-10 y por descripción normalizada, cuenta repeticiones y ordena por más reciente", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");
      const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;

      // Consulta 1: diagnóstico codificado + uno sin código.
      await signEncounterWithDiagnoses(doctor.accessToken, patientId, [
        { icd10Code, description: "Diabetes mellitus tipo 2", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
        {
          description: "Lumbalgia mecánica",
          codeAbsentReason: "Sin código específico satisfactorio en el buscador para este cuadro.",
          diagnosisType: "SECONDARY",
          certainty: "SUSPECTED",
        },
      ]);
      // Consulta 2: el MISMO código otra vez + la MISMA descripción con
      // formato distinto (mayúsculas/plural — debe deduplicar).
      const lastEncounterId = await signEncounterWithDiagnoses(doctor.accessToken, patientId, [
        { icd10Code, description: "DM2 en control", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
        {
          description: "LUMBALGIAS MECANICAS",
          codeAbsentReason: "Persiste el cuadro; sigue sin código específico satisfactorio.",
          diagnosisType: "SECONDARY",
          certainty: "CONFIRMED",
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/records/patients/${patientId}/active-diagnoses`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const coded = res.body.find((d: { icd10Code: string | null }) => d.icd10Code === icd10Code);
      expect(coded.timesRecorded).toBe(2);
      expect(coded.description).toBe("DM2 en control"); // la más reciente representa al grupo
      expect(coded.lastEncounterId).toBe(lastEncounterId);

      const uncoded = res.body.find((d: { icd10Code: string | null }) => d.icd10Code === null);
      expect(uncoded.timesRecorded).toBe(2); // "Lumbalgia mecánica" ≡ "LUMBALGIAS MECANICAS" tras normalizar
      expect(uncoded.certainty).toBe("CONFIRMED");
    });

    it("un paciente sin consultas firmadas regresa lista vacía; un borrador no cuenta", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken, "F");

      // Borrador sin firmar — no debe aparecer nada.
      const draft = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/encounters`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, encounterType: "FIRST_VISIT" });
      expect(draft.status).toBe(201);

      const res = await request(app.getHttpServer())
        .get(`/records/patients/${patientId}/active-diagnoses`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
