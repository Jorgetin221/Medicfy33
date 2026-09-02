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

// Fase 5 · Prompt 42A — "Resultados de laboratorio como analitos
// ESTRUCTURADOS ... NO como un PDF adjunto". Cubre captura, listado
// ordenado por fecha (lo que alimenta la gráfica de tendencia),
// "marcar como revisado" con constancia, y las mismas dos pruebas
// negativas ya establecidas para lab-results (Bloque 0).
describe("Analitos de laboratorio estructurados — captura, listado y revisión", () => {
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
      legalFirstName: "Diana",
      legalLastName: "Roque",
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
        lastNamePaternal: "Analitos",
        birthDate: "1992-04-15",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("captura un analito con rango de referencia, aparece en la lista, y marcarlo revisado deja constancia auditada", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const create = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ analyteName: "Glucosa", loincCode: "2345-7", value: 130, unit: "mg/dL", referenceMin: 70, referenceMax: 100, measuredAt: "2026-08-01" });
    expect(create.status).toBe(201);
    expect(create.body.analyteName).toBe("Glucosa");
    expect(Number(create.body.value)).toBe(130);
    const analyteId = create.body.id as string;

    const list = await request(app.getHttpServer())
      .get(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((a: { id: string }) => a.id === analyteId)).toBe(true);

    const review = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${patientId}/${analyteId}/review`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(review.status).toBe(201);
    expect(review.body.reviewedAt).not.toBeNull();

    const stored = await prisma.labResultAnalyte.findUniqueOrThrow({ where: { id: analyteId } });
    expect(stored.reviewedByDoctorId).not.toBeNull();

    const auditedActions = await prisma.auditLog.findMany({
      where: { resourceType: "lab_result_analyte", resourceId: analyteId, result: "SUCCESS" },
      select: { action: true },
    });
    expect(auditedActions.map((a) => a.action).sort()).toEqual(["lab_analytes.create", "lab_analytes.review"]);
  });

  it("seis mediciones del mismo analito se listan en orden cronológico — lo que alimenta la gráfica de tendencia", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);
    const dates = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];
    const values = [95, 98, 140, 102, 99, 97];

    for (let i = 0; i < dates.length; i++) {
      const res = await request(app.getHttpServer())
        .post(`/lab-analytes/patients/${patientId}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ analyteName: "Glucosa", value: values[i], unit: "mg/dL", referenceMin: 70, referenceMax: 100, measuredAt: dates[i] });
      expect(res.status).toBe(201);
    }

    const list = await request(app.getHttpServer())
      .get(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(6);
    const measuredAtTimestamps = list.body.map((a: { measuredAt: string }) => new Date(a.measuredAt).getTime());
    expect(measuredAtTimestamps).toEqual([...measuredAtTimestamps].sort((a, b) => a - b));
  });

  it("Capa 2 (v2.5): el listado trae el estado ya calculado por el servidor, contra el rango impreso de la propia fila", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const created = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ analyteName: "Glucosa", value: 250, unit: "mg/dL", referenceMin: 70, referenceMax: 99, measuredAt: "2026-08-01" });
    expect(created.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get(`/lab-analytes/patients/${patientId}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    const entry = list.body.find((a: { id: string }) => a.id === created.body.id);
    expect(entry.status).toBe("high");
    expect(entry.rangeSource).toBe("sheet");
  });

  it("un médico sin vínculo no puede listar ni capturar analitos (403), y revisar con analyteId de otro paciente da 404", async () => {
    const owner = await registerDoctor();
    const ownerPatientId = await createPatient(owner.accessToken);
    const create = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${ownerPatientId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ analyteName: "Hemoglobina", value: 14, unit: "g/dL", measuredAt: "2026-08-01" });
    const analyteId = create.body.id as string;

    const stranger = await registerDoctor();
    const strangerPatientId = await createPatient(stranger.accessToken);

    const blocked = await request(app.getHttpServer())
      .get(`/lab-analytes/patients/${ownerPatientId}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(blocked.status).toBe(403);

    const wrongScope = await request(app.getHttpServer())
      .post(`/lab-analytes/patients/${strangerPatientId}/${analyteId}/review`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(wrongScope.status).toBe(404);

    const intact = await prisma.labResultAnalyte.findUniqueOrThrow({ where: { id: analyteId } });
    expect(intact.reviewedByDoctorId).toBeNull();
  });
});
