import { randomUUID, createHash } from "node:crypto";
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

// §6.7 / hallazgo de la comparación contra medicfy-50-prompts.md:
// LabResultsController tenía POST (subir) y POST :id/review, pero
// ninguna ruta para volver a ver un resultado ya subido — ni médico
// ni paciente podían recuperarlo jamás. Esto prueba que list()/file()
// existen, respetan el límite por paciente, y quedan auditados.
describe("Resultados de laboratorio — listar y descargar lo ya subido", () => {
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
      legalFirstName: "Renata",
      legalLastName: "Ibarra",
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

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Lab",
        birthDate: "1985-01-01",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("sube un resultado, aparece en la lista, se descarga byte a byte igual, y queda auditado", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const fileContent = Buffer.from("%PDF-1.4 biometria hematica resultado de prueba");

    const upload = await request(app.getHttpServer())
      .post(`/lab-results/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", fileContent, { filename: "resultado.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    const resultId = upload.body.id as string;

    const list = await request(app.getHttpServer())
      .get(`/lab-results/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: string }) => r.id === resultId)).toBe(true);

    const file = await request(app.getHttpServer())
      .get(`/lab-results/patients/${patientId}/${resultId}/file`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(file.status).toBe(200);
    expect(Buffer.compare(Buffer.from(file.body), fileContent)).toBe(0);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "lab_results.file.download", resourceId: resultId, patientId },
    });
    expect(auditEntry).not.toBeNull();
  });

  // Fase 4c: la especificación (M10, casos límite) solo acepta
  // PDF/JPG para adjuntos de estudios — antes se subía cualquier tipo
  // de archivo sin validación (upload-validation.util.ts).
  it("rechaza formatos no permitidos (400 con código claro) y acepta JPG además de PDF", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const rejected = await request(app.getHttpServer())
      .post(`/lab-results/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("no es un resultado clinico"), { filename: "notas.txt", contentType: "text/plain" });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("LAB_RESULT_FILE_TYPE_NOT_ALLOWED");

    const jpgAccepted = await request(app.getHttpServer())
      .post(`/lab-results/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("contenido de imagen simulado"), { filename: "foto-resultado.jpg", contentType: "image/jpeg" });
    expect(jpgAccepted.status).toBe(201);
  });

  it("un médico sin vínculo con el paciente no puede descargar su resultado (403), y un resultId de otro paciente da 404", async () => {
    const ownerDoctor = await registerDoctor();
    const ownerPatientId = await createPatient(ownerDoctor.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/lab-results/patients/${ownerPatientId}`)
      .set("Authorization", `Bearer ${ownerDoctor.accessToken}`)
      .attach("file", Buffer.from("contenido privado"), { filename: "r.pdf", contentType: "application/pdf" });
    const resultId = upload.body.id as string;

    const otherDoctor = await registerDoctor();
    const otherPatientId = await createPatient(otherDoctor.accessToken);

    const blockedByCareRelationship = await request(app.getHttpServer())
      .get(`/lab-results/patients/${ownerPatientId}/${resultId}/file`)
      .set("Authorization", `Bearer ${otherDoctor.accessToken}`);
    expect(blockedByCareRelationship.status).toBe(403);

    const wrongPatientScope = await request(app.getHttpServer())
      .get(`/lab-results/patients/${otherPatientId}/${resultId}/file`)
      .set("Authorization", `Bearer ${otherDoctor.accessToken}`);
    expect(wrongPatientScope.status).toBe(404);
  });

  it("revisar un resultado queda auditado y visible en la lista", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/lab-results/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .attach("file", Buffer.from("otro resultado"), { filename: "r2.pdf", contentType: "application/pdf" });
    const resultId = upload.body.id as string;

    const review = await request(app.getHttpServer())
      .post(`/lab-results/patients/${patientId}/${resultId}/review`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ doctorComment: "Valores dentro de rango normal." });
    expect(review.status).toBe(201);
    expect(review.body.doctorComment).toBe("Valores dentro de rango normal.");

    const auditEntry = await prisma.auditLog.findFirst({ where: { action: "lab_results.review", resourceId: resultId } });
    expect(auditEntry).not.toBeNull();

    const fileHash = createHash("sha256").update(Buffer.from("otro resultado")).digest("hex");
    const stored = await prisma.labResult.findUniqueOrThrow({ where: { id: resultId } });
    expect(stored.fileHashSha256).toBe(fileHash);
  });

  // R4 — hallazgo #4 del Bloque 0 (26 ago 2026). reviewResult() buscaba
  // el resultado sólo por resultId y nunca comparaba result.patientId
  // con el de la ruta, mientras getResultFile() —la prueba de arriba—
  // sí lo hacía. El guard validaba un paciente y el servicio escribía
  // en otro.
  it("revisar con el resultId de OTRO paciente da 404 y no escribe nada en su expediente", async () => {
    const doctorVictima = await registerDoctor();
    const pacienteVictima = await createPatient(doctorVictima.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`/lab-results/patients/${pacienteVictima}`)
      .set("Authorization", `Bearer ${doctorVictima.accessToken}`)
      .attach("file", Buffer.from("resultado ajeno"), { filename: "ajeno.pdf", contentType: "application/pdf" });
    const resultIdAjeno = upload.body.id as string;

    // El atacante tiene vínculo con SU paciente, así que el guard lo
    // deja pasar: valida el patientId de la ruta, no el dueño del
    // resultado.
    const atacante = await registerDoctor();
    const pacientePropio = await createPatient(atacante.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/lab-results/patients/${pacientePropio}/${resultIdAjeno}/review`)
      .set("Authorization", `Bearer ${atacante.accessToken}`)
      .send({ doctorComment: "comentario inyectado" });

    expect(res.status).toBe(404);

    const intacto = await prisma.labResult.findUniqueOrThrow({ where: { id: resultIdAjeno } });
    expect(intacto.doctorComment).toBeNull();
    expect(intacto.reviewedByDoctorId).toBeNull();
    expect(intacto.reviewedAt).toBeNull();
  });
});
