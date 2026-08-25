import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "./services/notification.port";
import { TokenService } from "./services/token.service";

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

// M1-RN-002/M1-CA-003: "el médico puede entrar y configurar su
// perfil, pero no puede emitir recetas, órdenes ni notas clínicas
// hasta estar verified." Hallazgo de la auditoría de módulos
// (2026-08-25): DoctorVerifiedGuard existía y estaba bien escrito,
// pero no estaba conectado a ningún controlador clínico real — un
// médico SUBMITTED podía emitir receta/orden/nota vía la API. Este
// archivo prueba, con HTTP real (no invocando el guard aislado como
// ya hacía m1.integration.spec.ts), que las cuatro rutas que
// realmente "emiten" un documento clínico/legal quedan bloqueadas
// para un médico sin verificar y se desbloquean al verificarlo —
// nunca las rutas de borrador/lectura/cancelación, que el propio
// texto de la regla no restringe.
describe("Verificación de médico — enforcement real en las rutas de emisión clínica", () => {
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

  // A propósito, SIN verificar — es el punto de este archivo. Los
  // demás *.integration.spec.ts verifican al registrar porque a
  // ELLOS no les interesa probar este límite, solo necesitan pasarlo.
  async function registerUnverifiedDoctor(): Promise<{ userId: string; accessToken: string }> {
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
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    expect(doctor.verificationStatus).toBe("SUBMITTED");
    return { userId, accessToken };
  }

  async function verify(userId: string): Promise<void> {
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
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

  it("bloquea POST /prescriptions/encounters/:id para un médico sin verificar, y lo permite tras verificarlo", async () => {
    const doctor = await registerUnverifiedDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const body = {
      signatureRoute: "HANDWRITTEN_AFTER_PRINT",
      diagnosisSnapshot: "Cefalea tensional",
      items: [{ genericName: "Paracetamol", dose: "500 mg", route: "oral", frequency: "cada 8h", duration: "3 días" }],
    };
    // El catálogo real exige medicationCatalogId; para este archivo lo
    // que importa es si el guard responde ANTES de llegar a esa
    // validación, así que un id inventado sigue probando el límite.
    const blocked = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ ...body, items: [{ medicationCatalogId: randomUUID(), dose: "500 mg", route: "oral", frequency: "cada 8h", duration: "3 días" }] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("DOCTOR_NOT_VERIFIED");

    await verify(doctor.userId);
    const paracetamol = await prisma.medicationCatalog.findFirstOrThrow({ where: { genericName: "Paracetamol" } });
    const allowed = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        signatureRoute: "HANDWRITTEN_AFTER_PRINT",
        diagnosisSnapshot: "Cefalea tensional",
        items: [{ medicationCatalogId: paracetamol.id, dose: "500 mg", route: "oral", frequency: "cada 8h", duration: "3 días" }],
      });
    expect(allowed.status).toBe(201);
  });

  it("bloquea POST /prescriptions/encounters/:id/external-physical para un médico sin verificar, y lo permite tras verificarlo", async () => {
    const doctor = await registerUnverifiedDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const body = {
      physicalFolio: "COFEPRIS-0001",
      genericName: "Diazepam",
      controlGroup: "II",
      dose: "5 mg",
      route: "oral",
      frequency: "cada 12h",
      duration: "5 días",
    };
    const blocked = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}/external-physical`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("DOCTOR_NOT_VERIFIED");

    await verify(doctor.userId);
    const allowed = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}/external-physical`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(body);
    expect(allowed.status).toBe(201);
  });

  it("bloquea POST /records/encounters/:id/sign para un médico sin verificar, y lo permite tras verificarlo", async () => {
    const doctor = await registerUnverifiedDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const noteBody = {
      chiefComplaint: "Dolor abdominal",
      currentIllness: "Inicio hace 2 días, tipo cólico, sin fiebre",
      vitals: {},
      physicalExam: "Abdomen blando, doloroso a la palpación en epigastrio",
      assessment: "Probable gastritis",
      plan: "Omeprazol 20mg cada 24h por 7 días, dieta blanda",
      prognosis: "Bueno",
      diagnoses: [
        { description: "Gastritis aguda", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED", codeAbsentReason: "Diagnóstico clínico, sin código formal capturado" },
      ],
    };

    const blocked = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(noteBody);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("DOCTOR_NOT_VERIFIED");

    // Confirma que el bloqueo es real, no solo un rechazo de payload:
    // el encuentro sigue en DRAFT, no quedó firmado a medias.
    const stillDraft = await prisma.clinicalEncounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(stillDraft.status).toBe("DRAFT");

    await verify(doctor.userId);
    const allowed = await request(app.getHttpServer())
      .post(`/records/encounters/${encounterId}/sign`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(noteBody);
    expect(allowed.status).toBe(201);
  });

  it("bloquea POST /lab-orders/encounters/:id para un médico sin verificar, y lo permite tras verificarlo", async () => {
    const doctor = await registerUnverifiedDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const body = {
      signatureRoute: "HANDWRITTEN_AFTER_PRINT",
      clinicalIndication: "Sospecha de anemia",
      items: [{ studyName: "Biometría hemática completa" }],
    };
    const blocked = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("DOCTOR_NOT_VERIFIED");

    await verify(doctor.userId);
    const allowed = await request(app.getHttpServer())
      .post(`/lab-orders/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send(body);
    expect(allowed.status).toBe(201);
  });

  it("NO bloquea crear un encuentro en borrador ni actualizar la nota mientras está DRAFT — solo firmar", async () => {
    // La regla dice "no puede emitir... hasta estar verified", no
    // "no puede hacer nada clínico". Configurar un borrador antes de
    // firmar no es "emitir" — probarlo explícito evita que una
    // futura ampliación del guard rompa esto sin darse cuenta.
    const doctor = await registerUnverifiedDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const encounterId = await createEncounter(doctor.accessToken, patientId);

    const draftUpdate = await request(app.getHttpServer())
      .patch(`/records/encounters/${encounterId}/note`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ chiefComplaint: "Dolor de cabeza" });
    expect(draftUpdate.status).toBe(200);
  });
});
