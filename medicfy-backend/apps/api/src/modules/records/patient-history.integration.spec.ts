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

// M8-RN-012 / §10 de especificacion-plataforma-clinica-con-ia.md:
// antecedentes heredofamiliares/personales — viven en el paciente, se
// capturan una vez y "toda modificación queda versionada" (§10.4).
// Cubre el modelo genérico (categoría+subtipo), la versión en
// PatientHistoryItemChange, el upsert por clave única (no duplica), y
// la validación condicional de familyRelationship.
describe("Antecedentes del paciente (AHF/APNP/APP)", () => {
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
    return { userId, accessToken };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "Historia",
        birthDate: "1988-03-10",
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("crea un antecedente personal patológico con NO_INVESTIGADO por default si no se manda status distinto", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: "cirugias", status: "NO_INVESTIGADO" });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe("PERSONAL_PATOLOGICO");
    expect(res.body.subtype).toBe("cirugias");
    expect(res.body.familyRelationship).toBe("NONE");
    expect(res.body.status).toBe("NO_INVESTIGADO");

    const list = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("actualizar un antecedente existente versiona el valor anterior en PatientHistoryItemChange, sin duplicar filas", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const first = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_NO_PATOLOGICO", subtype: "tabaquismo", status: "DESCONOCIDO" });
    expect(first.status).toBe(201);
    const itemId = first.body.id as string;

    const second = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_NO_PATOLOGICO", subtype: "tabaquismo", status: "PRESENTE", freeText: "10 cigarros/día desde los 20 años" });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(itemId);
    expect(second.body.status).toBe("PRESENTE");
    expect(second.body.freeText).toBe("10 cigarros/día desde los 20 años");

    const rowCount = await prisma.patientHistoryItem.count({ where: { patientId } });
    expect(rowCount).toBe(1);

    const changes = await prisma.patientHistoryItemChange.findMany({ where: { historyItemId: itemId } });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.previousStatus).toBe("DESCONOCIDO");
    expect(changes[0]?.previousFreeText).toBeNull();
  });

  it("permite antecedentes heredofamiliares por línea familiar y exige familyRelationship (400 si falta)", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const missing = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "HEREDOFAMILIAR", subtype: "diabetes", status: "PRESENTE" });
    expect(missing.status).toBe(400);

    const madre = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "HEREDOFAMILIAR", subtype: "diabetes", familyRelationship: "MADRE", status: "PRESENTE" });
    expect(madre.status).toBe(201);
    expect(madre.body.familyRelationship).toBe("MADRE");

    const padre = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "HEREDOFAMILIAR", subtype: "diabetes", familyRelationship: "PADRE", status: "NEGADO" });
    expect(padre.status).toBe(201);

    // Misma subtype ("diabetes"), distinta línea familiar: dos filas
    // vigentes distintas, no un upsert que se pise entre sí.
    const list = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/history?category=HEREDOFAMILIAR`)
      .set("Authorization", `Bearer ${doctor.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
  });

  it("familyRelationship rechaza con 400 cuando la categoría no es HEREDOFAMILIAR", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ category: "PERSONAL_PATOLOGICO", subtype: "cirugias", familyRelationship: "MADRE", status: "PRESENTE" });

    expect(res.status).toBe(400);
  });

  it("un médico sin care_relationship activo no puede leer los antecedentes del paciente (403)", async () => {
    const owner = await registerDoctor();
    const patientId = await createPatient(owner.accessToken);
    const stranger = await registerDoctor();

    const res = await request(app.getHttpServer())
      .get(`/records/patients/${patientId}/history`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(403);
  });
});
