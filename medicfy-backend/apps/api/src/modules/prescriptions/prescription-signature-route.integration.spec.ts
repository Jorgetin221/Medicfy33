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

// Corrección v2.1 de especificacion-plataforma-clinica-con-ia.md §1:
// "la firma digital no debe ser obligatoria para imprimir una
// receta". Cubre las dos rutas de PrescriptionCreateInput
// (discriminated union por signatureRoute), la generación de PDF
// (antes inexistente para cualquiera de las dos), y la confirmación
// manual de "firmada y entregada".
describe("Receta — rutas de firma (autógrafa post-impresión vs. electrónica)", () => {
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
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, email, accessToken };
  }

  // La ruta ELECTRONIC llama a SignatureVerificationService.verify(),
  // que revisa la contraseña real y un TOTP real — a diferencia de
  // signAccessToken() (bypass de sesión), esto no se puede saltar.
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

  async function paracetamolId(): Promise<string> {
    const med = await prisma.medicationCatalog.findFirstOrThrow({ where: { genericName: "Paracetamol" } });
    return med.id;
  }

  function medicationItem(medicationCatalogId: string) {
    return { medicationCatalogId, dose: "500 mg", route: "oral", frequency: "cada 8h", duration: "3 días" };
  }

  describe("Ruta HANDWRITTEN_AFTER_PRINT", () => {
    it("emite sin password/totpCode, genera un PDF real, y el discriminated union rechaza si se manda password de todos modos", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);
      const medicationCatalogId = await paracetamolId();

      const res = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "HANDWRITTEN_AFTER_PRINT",
          diagnosisSnapshot: "Cefalea tensional",
          items: [medicationItem(medicationCatalogId)],
        });
      expect(res.status).toBe(201);
      expect(res.body.prescription.signatureRoute).toBe("HANDWRITTEN_AFTER_PRINT");
      expect(res.body.prescription.signatureMethod).toBeNull();
      expect(res.body.prescription.pdfFileKey).toBeTruthy();

      const prescriptionId = res.body.prescription.id as string;
      const row = await prisma.prescription.findUniqueOrThrow({ where: { id: prescriptionId } });
      expect(row.contentHashSha256).toBeTruthy();
      expect(row.qrVerificationToken).toBeTruthy();

      const pdf = await request(app.getHttpServer()).get(`/prescriptions/${prescriptionId}/pdf`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      expect(pdf.body.length).toBeGreaterThan(500);

      // Rechazo estructural: la variante HANDWRITTEN_AFTER_PRINT del
      // discriminated union es .strict() y no declara password/totpCode
      // — mandarlos igual debe rechazar con 400, no ignorarlos en silencio.
      const withPassword = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "HANDWRITTEN_AFTER_PRINT",
          diagnosisSnapshot: "Cefalea tensional",
          items: [medicationItem(medicationCatalogId)],
          password: "esto-no-deberia-aceptarse",
          totpCode: "000000",
        });
      expect(withPassword.status).toBe(400);
    });

    it("verificación pública muestra PENDING_HANDWRITTEN_SIGNATURE hasta que se confirma, y confirm-handwritten-delivery no se puede repetir ni usar en la ruta ELECTRONIC", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);
      const medicationCatalogId = await paracetamolId();

      const issued = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ signatureRoute: "HANDWRITTEN_AFTER_PRINT", diagnosisSnapshot: "Dx", items: [medicationItem(medicationCatalogId)] });
      const prescriptionId = issued.body.prescription.id as string;
      const token = issued.body.prescription.qrVerificationToken as string;

      const beforeConfirm = await request(app.getHttpServer()).get(`/verificar/${token}`);
      expect(beforeConfirm.body.status).toBe("PENDING_HANDWRITTEN_SIGNATURE");

      const wrongRoute = await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/confirm-handwritten-delivery`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      // (mismo prescriptionId, ruta correcta esta vez — la prueba de
      // "ruta incorrecta" real está más abajo con una receta ELECTRONIC)
      expect(wrongRoute.status).toBe(201);

      const afterConfirm = await request(app.getHttpServer()).get(`/verificar/${token}`);
      expect(afterConfirm.body.status).toBe("ISSUED");

      const again = await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/confirm-handwritten-delivery`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(again.status).toBe(409);
    });
  });

  describe("Ruta ELECTRONIC — comportamiento existente, sin cambios observables", () => {
    it("sigue exigiendo password+TOTP reales, y ahora también genera un PDF", async () => {
      const doctor = await registerDoctor();
      const otpauthUri = await enrollMfa(doctor.accessToken);
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);
      const medicationCatalogId = await paracetamolId();

      const wrongPassword = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "ELECTRONIC",
          diagnosisSnapshot: "Dx",
          items: [medicationItem(medicationCatalogId)],
          password: "contraseña-incorrecta-Segura123!",
          totpCode: totpFromUri(otpauthUri),
        });
      expect(wrongPassword.status).toBe(428);

      const res = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "ELECTRONIC",
          diagnosisSnapshot: "Dx",
          items: [medicationItem(medicationCatalogId)],
          password: STRONG_PASSWORD,
          totpCode: totpFromUri(otpauthUri),
        });
      expect(res.status).toBe(201);
      expect(res.body.prescription.signatureMethod).toBe("INTERNAL_SYSTEM");
      expect(res.body.prescription.signatureTimestamp).toBeTruthy();
      expect(res.body.prescription.pdfFileKey).toBeTruthy();

      const prescriptionId = res.body.prescription.id as string;

      // confirm-handwritten-delivery no aplica a esta ruta.
      const blocked = await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/confirm-handwritten-delivery`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(blocked.status).toBe(409);

      const verify = await request(app.getHttpServer()).get(`/verificar/${res.body.prescription.qrVerificationToken}`);
      expect(verify.body.status).toBe("ISSUED");
    });

    it("rechaza con 400 si falta signatureRoute (discriminated union) — no puede quedar ambiguo", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);
      const medicationCatalogId = await paracetamolId();

      const res = await request(app.getHttpServer())
        .post(`/prescriptions/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ diagnosisSnapshot: "Dx", items: [medicationItem(medicationCatalogId)] });
      expect(res.status).toBe(400);
    });
  });
});
