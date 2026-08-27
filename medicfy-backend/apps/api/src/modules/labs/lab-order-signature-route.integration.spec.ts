import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
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

// PNG mínimo construido a mano (RGB 8-bit, sin filtro, zlib real) en
// vez de un blob base64 externo cuya validez no se puede confirmar a
// simple vista — LabOrderPdfService llama a pdfkit's doc.image(),
// que necesita un PNG realmente decodificable, no solo bytes con
// content-type image/png.
// CRC-32 bit a bit (sin tabla precalculada) — evita indexar un
// array, que bajo noUncheckedIndexedAccess forzaría un no-null
// assertion para un invariante (0-255) que el compilador no puede
// probar por sí solo. Un PNG de prueba es diminuto; el costo extra
// de no usar tabla es irrelevante aquí.
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}
function buildTestPng(): Buffer {
  const width = 10;
  const height = 4;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  const ihdr = pngChunk("IHDR", ihdrData);

  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // sin filtro
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = 20;
      raw[px + 1] = 90;
      raw[px + 2] = 200;
    }
  }
  const idat = pngChunk("IDAT", deflateSync(raw));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// A petición explícita del usuario (2026-08-25): "no necesitamos
// código de 6 dígitos y la firma electrónica es opcional" para
// órdenes de laboratorio. A diferencia de recetas (M9-RN-009),
// ninguna regla M10 exige contraseña+TOTP — ver el plan aprobado.
// Cubre las dos rutas de LabOrderCreateInput (discriminated union por
// signatureRoute), el PDF real (antes inexistente), y el estampado de
// firma visual cuando el médico ya la subió en Perfil.
describe("Orden de laboratorio — rutas de firma (autógrafa post-impresión vs. electrónica)", () => {
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
    // DoctorVerifiedGuard (M1-RN-002) ahora protege lab-orders.create.
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, email, accessToken };
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
    // Fase 4 / prompt 32: los documentos (receta, orden) se emiten
    // desde una nota FIRMADA — el flujo de firma completo ya se prueba
    // en fase3-nota-datos; aquí se marca directo para aislar la regla
    // que ESTE archivo prueba.
    await prisma.clinicalEncounter.update({ where: { id: res.body.id as string }, data: { status: "SIGNED", signedAt: new Date() } });
    return res.body.id as string;
  }

  async function uploadSignatureImage(accessToken: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post("/doctors/me/branding-assets")
      .query({ kind: "signature" })
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("file", buildTestPng(), { filename: "firma.png", contentType: "image/png" });
    expect(res.status).toBe(201);
  }

  function labOrderItem() {
    // Prompt 37 (F4): el estudio y el motivo vienen del catálogo por
    // clave — el nombre lo resuelve el servidor.
    return { studyKey: "bh", motiveKey: "diagnostico_inicial" };
  }

  describe("Ruta HANDWRITTEN_AFTER_PRINT", () => {
    it("emite sin password/totpCode, genera un PDF real sin firma visual (el médico no ha subido ninguna), y el discriminated union rechaza si se manda password de todos modos", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const res = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "HANDWRITTEN_AFTER_PRINT",
          clinicalIndication: "Sospecha de anemia",
          items: [labOrderItem()],
        });
      expect(res.status).toBe(201);
      expect(res.body.signatureRoute).toBe("HANDWRITTEN_AFTER_PRINT");
      expect(res.body.signatureMethod).toBeNull();
      expect(res.body.signedAt).toBeNull();
      expect(res.body.pdfFileKey).toBeTruthy();

      const labOrderId = res.body.id as string;
      const row = await prisma.labOrder.findUniqueOrThrow({ where: { id: labOrderId } });
      expect(row.contentHashSha256).toBeTruthy();
      expect(row.qrVerificationToken).toBeTruthy();
      expect(row.doctorNameSnapshot).toBeTruthy();
      expect(row.patientNameSnapshot).toBeTruthy();

      const pdf = await request(app.getHttpServer()).get(`/lab-orders/${labOrderId}/pdf`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      expect(pdf.body.length).toBeGreaterThan(500);
      // Sin firma visual cargada: cae al texto de línea en blanco, sin
      // imagen embebida. "/Subtype /Image" (no solo "/Image": pdfkit
      // siempre escribe /ProcSet [/PDF /Text /ImageB /ImageC /ImageI]
      // en cada página, firma visual o no — eso daría un falso positivo).
      expect((pdf.body as Buffer).toString("latin1")).not.toContain("/Subtype /Image");

      const verify = await request(app.getHttpServer()).get(`/verificar/${row.qrVerificationToken}`);
      expect(verify.body.status).toBe("ISSUED");

      // Rechazo estructural: la variante HANDWRITTEN_AFTER_PRINT del
      // discriminated union es .strict() y no declara password/totpCode
      // — mandarlos igual debe rechazar con 400, no ignorarlos en silencio.
      const withPassword = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "HANDWRITTEN_AFTER_PRINT",
          clinicalIndication: "Sospecha de anemia",
          items: [labOrderItem()],
          password: "esto-no-deberia-aceptarse",
          totpCode: "000000",
        });
      expect(withPassword.status).toBe(400);
    });

    it("con firma visual ya cargada en Perfil, el PDF la incluye embebida — nunca como firma con validez legal electrónica", async () => {
      const doctor = await registerDoctor();
      await uploadSignatureImage(doctor.accessToken);
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const res = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "HANDWRITTEN_AFTER_PRINT",
          clinicalIndication: "Control anual",
          items: [labOrderItem()],
        });
      expect(res.status).toBe(201);
      expect(res.body.signatureRoute).toBe("HANDWRITTEN_AFTER_PRINT");

      const pdf = await request(app.getHttpServer())
        .get(`/lab-orders/${res.body.id}/pdf`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(pdf.status).toBe(200);
      // La imagen sí quedó embebida en el PDF (XObject real, no solo
      // el /ProcSet genérico que pdfkit ya escribe siempre). El texto
      // "Firma visual — no tiene validez legal electrónica." también
      // se dibuja (ver LabOrderPdfService), pero vive dentro del
      // content stream comprimido (FlateDecode) — no se puede
      // verificar por substring sobre los bytes crudos del PDF.
      expect((pdf.body as Buffer).toString("latin1")).toContain("/Subtype /Image");
    });
  });

  describe("Ruta ELECTRONIC — comportamiento existente", () => {
    it("sigue exigiendo password+TOTP reales, y ahora también genera un PDF", async () => {
      const doctor = await registerDoctor();
      const otpauthUri = await enrollMfa(doctor.accessToken);
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const wrongPassword = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "ELECTRONIC",
          clinicalIndication: "Dx",
          items: [labOrderItem()],
          password: "contraseña-incorrecta-Segura123!",
          totpCode: totpFromUri(otpauthUri),
        });
      expect(wrongPassword.status).toBe(428);

      const res = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          signatureRoute: "ELECTRONIC",
          clinicalIndication: "Dx",
          items: [labOrderItem()],
          password: STRONG_PASSWORD,
          totpCode: totpFromUri(otpauthUri),
        });
      expect(res.status).toBe(201);
      expect(res.body.signatureMethod).toBe("INTERNAL_SYSTEM");
      expect(res.body.signedAt).toBeTruthy();
      expect(res.body.pdfFileKey).toBeTruthy();

      const pdf = await request(app.getHttpServer()).get(`/lab-orders/${res.body.id}/pdf`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");

      const verify = await request(app.getHttpServer()).get(`/verificar/${res.body.qrVerificationToken}`);
      expect(verify.body.status).toBe("ISSUED");
    });

    it("rechaza con 400 si falta signatureRoute (discriminated union) — no puede quedar ambiguo", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);
      const encounterId = await createEncounter(doctor.accessToken, patientId);

      const res = await request(app.getHttpServer())
        .post(`/lab-orders/encounters/${encounterId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ clinicalIndication: "Dx", items: [labOrderItem()] });
      expect(res.status).toBe(400);
    });
  });
});
