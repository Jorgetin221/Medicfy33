import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
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

// Fase 5 · Prompt 41 — "Documentos con acceso controlado". El modelo
// ClinicalAttachment (M8-RN-010) ya existía en schema.prisma pero sin
// ningún controller/service que lo usara. Esto cubre: subir/listar
// (mismo patrón que lab-results), y sobre todo la URL firmada de vida
// corta que el prompt exige ("NO enlace permanente") — su éxito, su
// vencimiento (401 con código claro) y que no sirva para otra sesión.
describe("Documentos con acceso controlado — carga, listado y URL firmada de vida corta", () => {
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
      legalFirstName: "Bruno",
      legalLastName: "Solano",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Documentos",
        birthDate: "1990-06-01",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("sube un documento, aparece en la lista, la URL firmada sirve los bytes, y todo queda auditado", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const fileContent = Buffer.from("%PDF-1.4 estudio de imagen de prueba");

    const upload = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/documents?category=IMAGING&studyDate=2026-08-01&description=Radiografia+de+torax`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", fileContent, { filename: "rx.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    expect(upload.body.category).toBe("IMAGING");
    expect(upload.body.studyDate).toBe("2026-08-01T00:00:00.000Z");
    const documentId = upload.body.id as string;

    const list = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/documents`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((d: { id: string }) => d.id === documentId)).toBe(true);

    const signed = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/documents/${documentId}/signed-url`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(signed.status).toBe(200);
    expect(signed.body.url).toMatch(/^\/documents\/view\//);

    const view = await request(app.getHttpServer())
      .get(signed.body.url)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(view.status).toBe(200);
    expect(view.headers["content-type"]).toBe("application/pdf");
    expect(Buffer.compare(Buffer.from(view.body), fileContent)).toBe(0);

    const auditedActions = await prisma.auditLog.findMany({
      where: { resourceType: "clinical_attachment", resourceId: documentId, result: "SUCCESS" },
      select: { action: true },
    });
    const actions = auditedActions.map((a) => a.action).sort();
    expect(actions).toEqual(["records.documents.signedUrl", "records.documents.upload", "records.documents.view"]);
  });

  it("rechaza formatos no permitidos con 400 y código claro", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const rejected = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/documents?category=OTHER`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("no es un documento clinico"), { filename: "notas.txt", contentType: "text/plain" });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("LAB_RESULT_FILE_TYPE_NOT_ALLOWED");
  });

  it("un médico sin vínculo con el paciente no puede listar ni pedir URL firmada (403), y un documentId de otro paciente da 404", async () => {
    const owner = await registerDoctor();
    const ownerPatientId = await createPatient(owner.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/records/patients/${ownerPatientId}/documents?category=OTHER`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .attach("file", Buffer.from("contenido privado"), { filename: "d.pdf", contentType: "application/pdf" });
    const documentId = upload.body.id as string;

    const stranger = await registerDoctor();
    const strangerPatientId = await createPatient(stranger.accessToken);

    const blocked = await request(app.getHttpServer())
      .get(`/records/patients/${ownerPatientId}/documents`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(blocked.status).toBe(403);

    // El vínculo del atacante es con SU paciente — el guard lo deja
    // pasar; getForPatient() debe rechazar igual porque el documento
    // pertenece a otro expediente (mismo hallazgo que lab-results).
    const wrongScope = await request(app.getHttpServer())
      .get(`/records/patients/${strangerPatientId}/documents/${documentId}/signed-url`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(wrongScope.status).toBe(404);
  });

  it("una URL firmada vencida responde 401 con código claro y queda auditada como DENIED", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/documents?category=OTHER`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("contenido"), { filename: "d.pdf", contentType: "application/pdf" });
    const documentId = upload.body.id as string;

    const secret = process.env.JWT_ACCESS_SECRET as string;
    const expiredToken = jwt.sign(
      { purpose: "document_view", documentId, patientId, sub: doctor.userId },
      secret,
      { expiresIn: -10 }
    );

    const view = await request(app.getHttpServer())
      .get(`/documents/view/${expiredToken}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(view.status).toBe(401);
    expect(view.body.error.code).toBe("DOCUMENT_URL_EXPIRED");

    const denied = await prisma.auditLog.findFirst({
      where: { action: "records.documents.view", result: "DENIED", actorUserId: doctor.userId },
    });
    expect(denied).not.toBeNull();
  });

  it("una URL firmada por un médico no sirve bajo la sesión de otro médico (403)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/documents?category=OTHER`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("contenido"), { filename: "d.pdf", contentType: "application/pdf" });
    const documentId = upload.body.id as string;

    const signed = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/documents/${documentId}/signed-url`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);

    const otherDoctor = await registerDoctor();
    const viewAsOther = await request(app.getHttpServer())
      .get(signed.body.url)
      .set("Authorization", `Bearer ${otherDoctor.accessToken}`);
    expect(viewAsOther.status).toBe(403);
  });
});
