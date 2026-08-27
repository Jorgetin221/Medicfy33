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

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// M9-RN-008c extendida (2026-08-24): "Fase 2 — alertas de
// interacciones y alergias" de la especificación §2.3. La alerta por
// alergia y por nombre exacto duplicado ya existían (M9-RN-008a/c) y
// no se tocan aquí — se agrega solo la duplicidad por clase
// farmacológica (prefijo ATC de la OMS, primeros 4 caracteres),
// decisión explícita del usuario tras confirmar que no hay fuente de
// datos de interacciones fármaco-fármaco real en el proyecto.
describe("Receta — duplicidad terapéutica (nombre exacto y clase ATC)", () => {
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

  async function registerDoctor(): Promise<{ userId: string; email: string; accessToken: string }> {
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
    // DoctorVerifiedGuard (M1-RN-002) ahora protege prescriptions.create.
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, email, accessToken };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Prueba",
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

  async function addActiveMedication(accessToken: string, patientId: string, genericName: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/medications`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ genericName, dose: "dosis habitual", route: "VO", frequency: "según indicación", source: "PACIENTE" });
    expect(res.status).toBe(201);
  }

  async function medicationId(genericName: string): Promise<string> {
    const med = await prisma.medicationCatalog.findFirstOrThrow({ where: { genericName } });
    return med.id;
  }

  function medicationItem(medicationCatalogId: string) {
    return { medicationCatalogId, dose: "1 tableta", route: "oral", frequency: "cada 8h", duration: "3 días" };
  }

  it("marca duplicidad por nombre exacto y no la repite como duplicidad de clase", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);
    await addActiveMedication(doctor.accessToken, patientId, "Tramadol");
    const tramadolId = await medicationId("Tramadol");

    const res = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dolor", items: [medicationItem(tramadolId)] });

    expect(res.status).toBe(201);
    expect(res.body.warnings.therapeuticDuplicates).toEqual(["Tramadol"]);
    expect(res.body.warnings.therapeuticClassDuplicates).toEqual([]);
  });

  it("marca duplicidad por clase ATC cuando el nombre es distinto pero comparten subclase farmacológica (Tramadol y Morfina — N02A, opioides)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);
    await addActiveMedication(doctor.accessToken, patientId, "Morfina");
    const tramadolId = await medicationId("Tramadol");

    const res = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dolor", items: [medicationItem(tramadolId)] });

    expect(res.status).toBe(201);
    expect(res.body.warnings.therapeuticDuplicates).toEqual([]);
    expect(res.body.warnings.therapeuticClassDuplicates).toEqual([{ prescribedMedication: "Tramadol", existingMedication: "Morfina" }]);
  });

  it("no marca ninguna duplicidad entre medicamentos de clases distintas (Paracetamol y Losartán)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);
    await addActiveMedication(doctor.accessToken, patientId, "Losartán");
    const paracetamolId = await medicationId("Paracetamol");

    const res = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Cefalea", items: [medicationItem(paracetamolId)] });

    expect(res.status).toBe(201);
    expect(res.body.warnings.therapeuticDuplicates).toEqual([]);
    expect(res.body.warnings.therapeuticClassDuplicates).toEqual([]);
  });
});
