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
import { ContextAssemblerService } from "./services/context-assembler.service";

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

// Fase 8 · Prompt 50 — "Escribe una prueba que falle si algún dato
// identificable llega al payload." Este archivo prueba exactamente
// eso, más la forma de cada uno de los 9 bloques del contexto.
describe("ContextAssemblerService — El Segundo Lector (Prompt 50)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let assembler: ContextAssemblerService;

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
    assembler = moduleRef.get(ContextAssemblerService);
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

  // Marcadores de identidad DISTINTIVOS: si cualquiera de estos
  // strings aparece en el contexto serializado, la seudonimización
  // falló. firstName/lastNamePaternal deliberadamente no comparten
  // substring con nada clínico (nombre de antecedente, medicamento,
  // etc.) para que un match sea inequívoco.
  const identityMarkers = {
    firstName: "Xochiquetzalcoyotl",
    lastNamePaternal: "Zzyzxavier",
    curp: "ZZYX000101MDFXCH07",
    email: uniqueEmail("paciente.secreto"),
    phone: uniquePhone(),
    addressStreet: "Callejón Inconfundible 999",
  };

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: identityMarkers.firstName,
        lastNamePaternal: identityMarkers.lastNamePaternal,
        birthDate: "1994-03-15",
        sexAtBirth: "F",
        phoneE164: identityMarkers.phone,
        email: identityMarkers.email,
      });
    expect(res.status).toBe(201);
    const patientId = res.body.id as string;
    await prisma.patient.update({
      where: { id: patientId },
      data: { curp: identityMarkers.curp, addressStreet: identityMarkers.addressStreet },
    });
    return patientId;
  }

  async function signEncounter(
    accessToken: string,
    otpauthUri: string,
    patientId: string,
    diagnoses: Record<string, unknown>[],
    note: Record<string, unknown> = VALID_NOTE
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
      .send({ ...note, diagnoses, password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(signed.status).toBe(201);
    return encounterId;
  }

  it("arma los 9 bloques del contexto y nunca incluye un dato identificable del paciente", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);
    const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;

    // Problemas + Trayectoria: 4 consultas firmadas (solo las últimas
    // 3 deben llegar a Trayectoria).
    const encounterIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const encounterId = await signEncounter(doctor.accessToken, otpauthUri, patientId, [
        { icd10Code, description: "Hipertensión arterial", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
      ]);
      encounterIds.push(encounterId);
    }
    const lastSignedEncounterId = encounterIds[encounterIds.length - 1];

    // Seguridad: una alergia ACTIVA y una INACTIVA — solo la activa
    // debe llegar al contexto.
    await prisma.patientAllergy.create({
      data: {
        patientId,
        substance: "Penicilina",
        allergyType: "MEDICATION",
        reaction: "Urticaria generalizada",
        severity: "SEVERA",
        status: "ACTIVE",
        certainty: "CONFIRMED",
        source: "DOCTOR",
      },
    });
    await prisma.patientAllergy.create({
      data: {
        patientId,
        substance: "Mariscos",
        allergyType: "FOOD",
        severity: "LEVE",
        status: "INACTIVE",
        certainty: "LIKELY",
        source: "DOCTOR",
      },
    });

    // Medicación: una ACTIVA y una SUSPENDIDA — solo la activa debe
    // llegar al contexto.
    await prisma.patientMedication.create({
      data: {
        patientId,
        genericName: "Losartán",
        dose: "50 mg",
        route: "Oral",
        frequency: "Cada 24 horas",
        status: "ACTIVE",
        source: "DOCTOR",
      },
    });
    await prisma.patientMedication.create({
      data: {
        patientId,
        genericName: "Ibuprofeno",
        dose: "400 mg",
        route: "Oral",
        frequency: "Cada 8 horas",
        status: "SUSPENDED",
        source: "DOCTOR",
      },
    });

    // Antecedentes: un PRESENTE (heredofamiliar, con parentesco) y un
    // NEGADO — solo el presente debe llegar al contexto.
    await prisma.patientHistoryItem.create({
      data: {
        patientId,
        category: "HEREDOFAMILIAR",
        subtype: "diabetes_mellitus",
        familyRelationship: "MADRE",
        status: "PRESENTE",
        freeText: "Diagnosticada a los 50 años.",
        updatedByUserId: doctor.userId,
      },
    });
    await prisma.patientHistoryItem.create({
      data: {
        patientId,
        category: "PERSONAL_PATOLOGICO",
        subtype: "tuberculosis",
        status: "NEGADO",
        updatedByUserId: doctor.userId,
      },
    });

    // Laboratorio: dos lecturas del MISMO analito — solo la más
    // reciente debe llegar al contexto.
    await prisma.labResultAnalyte.create({
      data: {
        patientId,
        analyteName: "Glucosa",
        value: 130,
        unit: "mg/dL",
        referenceMin: 70,
        referenceMax: 100,
        measuredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        enteredByUserId: doctor.userId,
      },
    });
    await prisma.labResultAnalyte.create({
      data: {
        patientId,
        analyteName: "Glucosa",
        value: 98,
        unit: "mg/dL",
        referenceMin: 70,
        referenceMax: 100,
        measuredAt: new Date(),
        enteredByUserId: doctor.userId,
      },
    });

    // Paciente: embarazo activo — debe llegar con semanas/días.
    const pregnancyCreated = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/pregnancy`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ lmpDate: isoDaysAgo(10 * 7) });
    expect(pregnancyCreated.status).toBe(201);

    // Actual + Encuadre: un encuentro NUEVO, sin firmar, con nota en
    // curso — distinto tipo al de las consultas ya firmadas.
    const draftCreated = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(draftCreated.status).toBe(201);
    const currentEncounterId = draftCreated.body.id as string;
    const draftPatch = await request(app.getHttpServer())
      .patch(`/records/encounters/${currentEncounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ chiefComplaint: "Cefalea de 3 días de evolución", assessment: "Probable cefalea tensional." });
    expect(draftPatch.status).toBe(200);

    const doctorRow = await prisma.doctor.findUniqueOrThrow({
      where: { userId: doctor.userId },
      select: { primarySpecialty: { select: { nameEs: true } } },
    });

    const result = await assembler.assemble(currentEncounterId);
    const { context } = result;

    // ── Forma de cada bloque ─────────────────────────────────────
    expect(context.paciente.edadAnios).toBeGreaterThan(0);
    expect(context.paciente.sexo).toBe("F");
    expect(context.paciente.embarazo).not.toBeNull();
    expect(context.paciente.embarazo?.semanasGestacion).toBeGreaterThanOrEqual(9);

    expect(context.seguridad).toHaveLength(1);
    expect(context.seguridad[0]).toEqual({ sustancia: "Penicilina", reaccion: "Urticaria generalizada", gravedad: "SEVERA" });

    expect(context.problemas.length).toBeGreaterThan(0);
    expect(context.problemas.some((p) => p.codigoIcd10 === icd10Code)).toBe(true);

    expect(context.medicacion).toHaveLength(1);
    expect(context.medicacion[0]).toEqual({ nombreGenerico: "Losartán", dosis: "50 mg", via: "Oral", frecuencia: "Cada 24 horas" });

    expect(context.antecedentes).toHaveLength(1);
    expect(context.antecedentes[0]).toEqual({
      categoria: "HEREDOFAMILIAR",
      subtipo: "diabetes_mellitus",
      parentesco: "MADRE",
      comentario: "Diagnosticada a los 50 años.",
    });

    expect(context.laboratorio).toHaveLength(1);
    expect(context.laboratorio[0]!.analito).toBe("Glucosa");
    expect(context.laboratorio[0]!.valor).toBe("98");
    // v2.5 · Capa 4: el estado ya viene decidido por el servidor
    // (Capa 2), nunca lo redecide el modelo — 98 está dentro de 70-100.
    expect(context.laboratorio[0]!.estado).toBe("normal");

    expect(context.trayectoria).toHaveLength(3);
    expect(context.trayectoria[0]!.motivoConsulta).toBe(VALID_NOTE.chiefComplaint);
    expect(context.trayectoria.map((t) => t.valoracion)).toEqual(["Evolución estable.", "Evolución estable.", "Evolución estable."]);

    expect(context.actual).toEqual({ motivoConsulta: "Cefalea de 3 días de evolución", valoracion: "Probable cefalea tensional." });
    expect(context.encuadre).toEqual({ especialidad: doctorRow.primarySpecialty?.nameEs ?? null, tipoConsulta: "FIRST_VISIT" });

    // ── El hash existe y es un SHA-256 hex ──────────────────────
    expect(result.hashContexto).toMatch(/^[0-9a-f]{64}$/);

    // ── La prueba que el prompt pide explícitamente ─────────────
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(identityMarkers.firstName);
    expect(serialized).not.toContain(identityMarkers.lastNamePaternal);
    expect(serialized).not.toContain(identityMarkers.curp);
    expect(serialized).not.toContain(identityMarkers.email);
    expect(serialized).not.toContain(identityMarkers.phone);
    expect(serialized).not.toContain(identityMarkers.addressStreet);

    const patientRow = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { medicfyId: true } });
    expect(serialized).not.toContain(patientRow.medicfyId);
    expect(serialized).not.toContain(patientId);
    expect(serialized).not.toContain(lastSignedEncounterId);
  });

  it("assembleStableBlock es independiente del encuentro: mismo resultado sin importar cuál encuentro esté activo", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);
    const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;
    await signEncounter(doctor.accessToken, otpauthUri, patientId, [
      { icd10Code, description: "Rinitis alérgica", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" },
    ]);

    const first = await assembler.assembleStableBlock(patientId);
    const second = await assembler.assembleStableBlock(patientId);
    expect(second).toEqual(first);
  });
});
