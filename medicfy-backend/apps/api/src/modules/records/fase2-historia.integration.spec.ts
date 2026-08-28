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
const VALID_NOTE = {
  chiefComplaint: "Primera consulta completa",
  currentIllness: "Captura estructurada de historia clínica.",
  vitals: {},
  assessment: "Historia clínica en construcción.",
  plan: "Completar bloques de antecedentes.",
};

// Fase 2 (prompts 18-24) — las CINCO pruebas literales del prompt 24,
// más los contratos de catálogo de alergias (23A) y plantillas (23B).
describe("Fase 2 · Historia clínica estructurada (prompt 24)", () => {
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
      legalLastName: "Fase2",
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

  async function createPatient(accessToken: string, sexAtBirth: "F" | "M", birthDate = "1994-03-15"): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Historia",
        birthDate,
        sexAtBirth,
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("24.1 — ningún campo de antecedente acepta un término fuera del catálogo; uno aprobado por el curador es usable de inmediato", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken, "F");

    const invented = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: "termino_inventado_xyz", status: "PRESENTE" });
    expect(invented.status).toBe(422);
    expect(invented.body.error.code).toBe("HISTORY_SUBTYPE_NOT_IN_CATALOG");

    // Del catálogo sembrado — pasa, y queda REFERENCIADO al término.
    const ok = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: "cirugias", status: "PRESENTE", freeText: "Apendicectomía 2015" });
    expect(ok.status).toBe(201);
    expect(ok.body.catalogTermId).not.toBeNull();

    // Flujo del prompt 10 de punta a punta: el médico solicita, el
    // curador aprueba, y el término nuevo se usa al instante.
    const curator = await prisma.user.create({
      data: { email: uniqueEmail("curator"), passwordHash: "x", primaryRole: "CURATOR", status: "ACTIVE" },
    });
    const curatorToken = tokenService.signAccessToken({ sub: curator.id, primaryRole: "CURATOR" });
    const newKey = `zztest_ant_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
    const requested = await request(app.getHttpServer())
      .post("/catalogs/ANTECEDENTE/term-requests")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ proposedTerm: `ZZTEST Antecedente ${newKey}` });
    expect(requested.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/catalogs/term-requests/${requested.body.id}/approve`)
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: newKey, codingSystem: "PROPIETARIO" })
      .expect(201);

    const usingNew = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: newKey, status: "PRESENTE" });
    expect(usingNew.status).toBe(201);
  });

  it("24.2 — un paciente masculino no muestra el bloque gineco-obstétrico salvo habilitación explícita", async () => {
    const doctor = await registerDoctor();
    const malePatient = await createPatient(doctor.accessToken, "M");

    const hidden = await request(app.getHttpServer())
      .get(`/records/patients/${malePatient}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(hidden.status).toBe(200);
    expect(hidden.body.visible).toBe(false);

    const blockedWrite = await request(app.getHttpServer())
      .post(`/records/patients/${malePatient}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ menarcheAge: 12 });
    expect(blockedWrite.status).toBe(422);
    expect(blockedWrite.body.error.code).toBe("GYNECO_BLOCK_NOT_ENABLED");

    // Habilitación explícita → visible y editable.
    await request(app.getHttpServer())
      .post(`/records/patients/${malePatient}/gyneco-history/enable`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .expect(201);
    const afterEnable = await request(app.getHttpServer())
      .post(`/records/patients/${malePatient}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ gestas: 0 });
    expect(afterEnable.status).toBe(201);

    // Paciente femenino: visible por omisión, con fórmula obstétrica.
    const femalePatient = await createPatient(doctor.accessToken, "F");
    const visible = await request(app.getHttpServer())
      .get(`/records/patients/${femalePatient}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(visible.body.visible).toBe(true);
    const saved = await request(app.getHttpServer())
      .post(`/records/patients/${femalePatient}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ menarcheAge: 12, gestas: 3, partos: 2, cesareas: 0, abortos: 1, contraceptiveMethod: "DIU" });
    expect(saved.status).toBe(201);
    expect(saved.body.gestas).toBe(3);
  });

  it("24.3 — 6 cigarros al día durante 12 años produce índice tabáquico 3.6, calculado y ALMACENADO con fórmula y versión", async () => {
    const doctor = await registerDoctor();
    // Nacimiento y suspensión elegidos para una duración de 12 años
    // exactos: inicio a los 18, suspendido el día que cumple 30.
    const patientId = await createPatient(doctor.accessToken, "F", "1990-01-01");

    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        substanceKey: "tabaco",
        status: "SUSPENDIDO",
        quantity: 6,
        unit: "CIGARROS_POR_DIA",
        ageOfOnset: 18,
        suspendedAt: "2020-01-01",
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.packYears)).toBeCloseTo(3.6, 1);
    expect(res.body.computeFormula).toContain("cigarros_por_dia");
    expect(res.body.computeVersion).toBe("v1");

    // Alcohol: unidades estándar por semana.
    const alcohol = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ substanceKey: "alcohol", status: "ACTIVO", quantity: 10, unit: "UNIDADES_POR_SEMANA", ageOfOnset: 20 });
    expect(alcohol.status).toBe(201);
    expect(Number(alcohol.body.stdDrinksPerWeek)).toBe(10);

    // "Un sí-fuma sin cantidad no sirve": activo sin cantidad → 400.
    const noQty = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ substanceKey: "cannabis", status: "ACTIVO" });
    expect(noQty.status).toBe(400);

    // NEGADO sí puede ir sin cantidad.
    const negado = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ substanceKey: "cocaina", status: "NEGADO" });
    expect(negado.status).toBe(201);
  });

  it("24.4 — modificar un antecedente conserva y permite consultar el valor previo con fecha y autor", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken, "F", "1990-01-01");

    // Toxicomanía: dos versiones — la primera queda en el change log.
    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ substanceKey: "tabaco", status: "ACTIVO", quantity: 10, unit: "CIGARROS_POR_DIA", ageOfOnset: 18 })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/substance-uses`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ substanceKey: "tabaco", status: "SUSPENDIDO", quantity: 10, unit: "CIGARROS_POR_DIA", ageOfOnset: 18, suspendedAt: "2024-01-01" })
      .expect(201);

    const changes = await prisma.patientSubstanceUseChange.findMany({ where: { substanceUseId: updated.body.id } });
    expect(changes).toHaveLength(1);
    expect((changes[0]?.previousValue as { status: string }).status).toBe("ACTIVO");
    expect(changes[0]?.changedByUserId).toBe(doctor.userId);
    expect(changes[0]?.changedAt).toBeInstanceOf(Date);

    // Gineco: igual — el valor previo sobrevive con autor y fecha.
    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ gestas: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/gyneco-history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ gestas: 2 })
      .expect(201);
    const gyneco = await prisma.patientGynecoHistory.findUniqueOrThrow({ where: { patientId } });
    const gynecoChanges = await prisma.patientGynecoHistoryChange.findMany({ where: { gynecoHistoryId: gyneco.id } });
    expect(gynecoChanges.length).toBeGreaterThanOrEqual(1);
    expect((gynecoChanges[0]?.previousValue as { gestas: number }).gestas).toBe(1);
  });

  it("24.5 — aplicar una plantilla y firmar sin revisar devuelve error indicando los campos heredados pendientes", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken, "F");

    // Plantilla con subtipo inventado: se rechaza AL CREARLA.
    const badTemplate = await request(app.getHttpServer())
      .post("/records/antecedentes-templates")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        name: "Mala",
        items: [{ category: "PERSONAL_PATOLOGICO", subtype: "no_existe_xyz", status: "NEGADO" }],
      });
    expect(badTemplate.status).toBe(422);

    const template = await request(app.getHttpServer())
      .post("/records/antecedentes-templates")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        name: "Adulto sano — medicina general",
        specialtyCode: "GENERAL",
        items: [
          { category: "HEREDOFAMILIAR", subtype: "diabetes", familyRelationship: "MADRE", status: "NEGADO" },
          { category: "PERSONAL_PATOLOGICO", subtype: "cirugias", status: "NEGADO" },
        ],
      });
    expect(template.status).toBe(201);

    const applied = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/antecedentes-templates/${template.body.id}/apply`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(applied.status).toBe(201);
    expect(applied.body.appliedCount).toBe(2);

    // Intento de firma con heredados sin revisar → 422 con la lista.
    const encounter = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    const icd10Code = (await prisma.icd10Code.findFirstOrThrow()).code;
    const diagnoses = [{ icd10Code, description: "Control", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }];
    const blockedSign = await request(app.getHttpServer())
      .post(`/records/encounters/${encounter.body.id}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, diagnoses, password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) });
    expect(blockedSign.status).toBe(422);
    expect(blockedSign.body.error.code).toBe("ENCOUNTER_INHERITED_UNREVIEWED");
    expect(blockedSign.body.error.details.pendingItems).toHaveLength(2);

    // Revisar: uno confirmándolo tal cual, otro re-capturándolo.
    const pending = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/history-pending-inherited`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(pending.body).toHaveLength(2);
    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history/${pending.body[0].id}/confirm-inherited`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: "cirugias", status: "PRESENTE", freeText: "Colecistectomía 2019" })
      .expect(201);

    // Ya sin heredados pendientes, la firma pasa.
    await request(app.getHttpServer())
      .post(`/records/encounters/${encounter.body.id}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...VALID_NOTE, diagnoses, password: STRONG_PASSWORD, totpCode: totpFromUri(otpauthUri) })
      .expect(201);
  });

  it("23A — la alergia nace del catálogo: agente por clave, anclada al término (y opcionalmente al medicamento)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken, "F");

    const unknown = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ agentKey: "agente_inventado", allergyType: "MEDICAMENTO", severity: "GRAVE", certainty: "CONFIRMED", source: "PACIENTE" });
    expect(unknown.status).toBe(422);

    const created = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/allergies`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        agentKey: "penicilinas",
        allergyType: "MEDICAMENTO",
        severity: "GRAVE",
        reaction: "Anafilaxia",
        certainty: "CONFIRMED",
        source: "PACIENTE",
      });
    expect(created.status).toBe(201);
    expect(created.body.substance).toBe("Penicilinas");
    expect(created.body.catalogTermId).not.toBeNull();
  });
});
