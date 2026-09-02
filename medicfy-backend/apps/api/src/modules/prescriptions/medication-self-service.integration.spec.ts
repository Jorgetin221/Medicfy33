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

// Autoservicio de catálogo de medicamentos — el médico agrega un
// medicamento que no encontró, sin aprobación de admin (decisión
// explícita del usuario, 2026-09-02). R5 (bloqueo duro Grupos I/II)
// debe seguir aplicando exactamente igual sobre estas filas.
describe("Medicamentos — autoservicio del médico (sin aprobación de admin)", () => {
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

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "AutoservicioMed",
        birthDate: "1990-01-01",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("paciente"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("un médico agrega un medicamento no controlado directamente, sin aprobación de admin, y aparece en la búsqueda", async () => {
    const doctor = await registerDoctor();
    const genericName = `Medicamento Prueba ${randomUUID()}`;

    const created = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        genericName,
        presentations: [{ label: "Tableta 100 mg" }],
        controlGroup: "VI",
        brandNames: ["MarcaPrueba"],
      });
    expect(created.status).toBe(201);
    expect(created.body.isElectronicallyPrescribable).toBe(true);
    expect(created.body.addedByDoctorId).toBeTruthy();

    const found = await request(app.getHttpServer())
      .get(`/medications?search=${encodeURIComponent(genericName)}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(found.status).toBe(200);
    expect(found.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);
  });

  it("el servidor DERIVA isElectronicallyPrescribable=false para Grupo I, ignorando cualquier intento del cliente de fijarlo distinto", async () => {
    const doctor = await registerDoctor();
    const created = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        genericName: `Controlado Prueba ${randomUUID()}`,
        presentations: [{ label: "Ampolleta 10 mg/mL" }],
        controlGroup: "I",
        // isElectronicallyPrescribable NO es un campo del schema — si
        // el cliente lo manda, .strict() lo rechaza (400), no lo acepta.
        isElectronicallyPrescribable: true,
      });
    expect(created.status).toBe(400);
  });

  it("R5 — un médico prescribe electrónicamente un medicamento Grupo I recién agregado por él mismo: el bloqueo duro sigue aplicando igual que a uno sembrado", async () => {
    const doctor = await registerDoctor();
    const otpauthUri = await enrollMfa(doctor.accessToken);
    const patientId = await createPatient(doctor.accessToken);

    const created = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        genericName: `Opioide Prueba ${randomUUID()}`,
        presentations: [{ label: "Solución inyectable 10 mg/mL" }],
        controlGroup: "I",
      });
    expect(created.status).toBe(201);
    expect(created.body.isElectronicallyPrescribable).toBe(false);

    const encounterRes = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/encounters`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ patientId, encounterType: "FIRST_VISIT" });
    expect(encounterRes.status).toBe(201);
    const encounterId = encounterRes.body.id as string;

    const prescribed = await request(app.getHttpServer())
      .post(`/prescriptions/encounters/${encounterId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        signatureRoute: "ELECTRONIC",
        diagnosisSnapshot: "Dolor agudo, requiere manejo con opioide.",
        password: STRONG_PASSWORD,
        totpCode: totpFromUri(otpauthUri),
        items: [
          {
            medicationCatalogId: created.body.id,
            dose: "10",
            doseUnit: "mg",
            route: "IV",
            frequency: "cada 8h",
            duration: "3 días",
          },
        ],
      });
    expect(prescribed.status).toBe(422);
    expect(prescribed.body.error.code).toBe("PRESCRIPTION_CONTROLLED_BLOCKED");
  });

  it("no permite agregar el mismo medicamento dos veces (case/acento-insensible) — sugiere el existente en vez de duplicar", async () => {
    const doctor = await registerDoctor();
    const genericName = `Duplicado Prueba ${randomUUID()}`;

    const first = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ genericName, presentations: [{ label: "Tableta 50 mg" }], controlGroup: "VI" });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ genericName: genericName.toUpperCase(), presentations: [{ label: "Tableta 50 mg" }], controlGroup: "VI" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("MEDICATION_ALREADY_EXISTS");
  });

  it("un paciente autenticado no puede agregar medicamentos al catálogo (403)", async () => {
    const doctorForPatient = await registerDoctor();
    const patientRegister = await request(app.getHttpServer()).post("/auth/register/patient").send({
      email: uniqueEmail("paciente-auth"),
      password: STRONG_PASSWORD,
      phone: uniquePhone(),
      firstName: "Paciente",
      lastNamePaternal: "Solicitante",
      birthDate: "1990-01-01",
      sexAtBirth: "F",
      consents: { privacyNotice: true, sensitiveData: true, digitalPrescriptionChannel: false },
    });
    expect(patientRegister.status).toBe(201);
    void doctorForPatient;
    const patientAccessToken = tokenService.signAccessToken({ sub: patientRegister.body.userId, primaryRole: "PATIENT" });

    const res = await request(app.getHttpServer())
      .post("/medications")
      .set("Authorization", `Bearer ${patientAccessToken}`)
      .send({ genericName: `Intento Paciente ${randomUUID()}`, presentations: [{ label: "Tableta" }], controlGroup: "VI" });
    expect(res.status).toBe(403);
  });
});
