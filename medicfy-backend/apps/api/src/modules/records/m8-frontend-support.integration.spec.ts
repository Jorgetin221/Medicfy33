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
import { AppointmentStateMachineService } from "../scheduling/services/appointment-state-machine.service";

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
function isoDaysFromNow(days: number, hour = 10): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// Cubre lo agregado para desbloquear el frontend de DOC-06/expediente
// (ver el plan aprobado, sección Frontend): catálogos buscables
// (icd10/medications), plantillas de nota, y que firmar un encounter
// complete automáticamente la cita ligada ("cuando M8 exista, la ruta
// real a completed se vuelve la primaria" — comentario original de
// completedWithoutNoteReason en schema.prisma).
describe("Soporte de frontend M8 — catálogos, plantillas, firma completa la cita", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let appointmentService: AppointmentStateMachineService;

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
    appointmentService = moduleRef.get(AppointmentStateMachineService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    // DoctorVerifiedGuard (M1-RN-002) ahora protege encounters.sign.
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createService(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes: 30, priceMxn: 500 });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Luis",
        lastNamePaternal: "Hernández",
        birthDate: "1990-05-15",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  function signPayload() {
    return {
      chiefComplaint: "Dolor de cabeza",
      currentIllness: "2 días de evolución",
      vitals: {},
      assessment: "Cefalea tensional",
      plan: "Analgesia",
      diagnoses: [{ icd10Code: "R51", description: "Cefalea", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }],
    };
  }

  describe("GET /icd10", () => {
    it("busca por código o descripción, y sin ?search regresa el catálogo activo", async () => {
      const doctor = await registerDoctor();
      const bySearch = await request(app.getHttpServer())
        .get("/icd10?search=cefalea")
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(bySearch.status).toBe(200);
      expect(bySearch.body.some((c: { code: string }) => c.code === "R51")).toBe(true);

      const all = await request(app.getHttpServer()).get("/icd10").set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(all.status).toBe(200);
      expect(all.body.length).toBeGreaterThan(0);
    });

    it("rechaza sin sesión", async () => {
      const res = await request(app.getHttpServer()).get("/icd10");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /medications", () => {
    it("incluye controlGroup/isElectronicallyPrescribable — Morfina (Grupo I) sale bloqueada", async () => {
      const doctor = await registerDoctor();
      const res = await request(app.getHttpServer())
        .get("/medications?search=Morfina")
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].controlGroup).toBe("I");
      expect(res.body[0].isElectronicallyPrescribable).toBe(false);
    });
  });

  describe("/note-templates", () => {
    it("crea, lista solo las propias, rechaza atajo duplicado, y permite borrar", async () => {
      const doctorA = await registerDoctor();
      const doctorB = await registerDoctor();

      const created = await request(app.getHttpServer())
        .post("/note-templates")
        .set("Authorization", `Bearer ${doctorA.accessToken}`)
        .send({ label: "Exploración normal", content: "TA 120/80, FC 72, afebril, sin datos de alarma.", shortcutKey: "1" });
      expect(created.status).toBe(201);

      const dup = await request(app.getHttpServer())
        .post("/note-templates")
        .set("Authorization", `Bearer ${doctorA.accessToken}`)
        .send({ label: "Otra", content: "Contenido distinto", shortcutKey: "1" });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("NOTE_TEMPLATE_SHORTCUT_TAKEN");

      const listA = await request(app.getHttpServer()).get("/note-templates").set("Authorization", `Bearer ${doctorA.accessToken}`);
      expect(listA.body).toHaveLength(1);

      const listB = await request(app.getHttpServer()).get("/note-templates").set("Authorization", `Bearer ${doctorB.accessToken}`);
      expect(listB.body).toHaveLength(0);

      const deleteByOther = await request(app.getHttpServer())
        .delete(`/note-templates/${created.body.id}`)
        .set("Authorization", `Bearer ${doctorB.accessToken}`);
      expect(deleteByOther.status).toBe(404);

      const deleteByOwner = await request(app.getHttpServer())
        .delete(`/note-templates/${created.body.id}`)
        .set("Authorization", `Bearer ${doctorA.accessToken}`);
      expect(deleteByOwner.status).toBe(204);
    });
  });

  describe("Firmar un encounter completa la cita ligada", () => {
    it("IN_PROGRESS -> COMPLETED con completedWithoutNoteReason=null al firmar", async () => {
      const doctor = await registerDoctor();
      const serviceId = await createService(doctor.accessToken);
      const patientId = await createPatient(doctor.accessToken);

      const appt = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, serviceId, startsAt: isoDaysFromNow(1) });
      expect(appt.status).toBe(201);

      await appointmentService.confirmPayment(appt.body.id, doctor.userId);
      await appointmentService.start(appt.body.id, doctor.userId);

      const encounter = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/encounters`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, appointmentId: appt.body.id, encounterType: "FIRST_VISIT" });
      expect(encounter.status).toBe(201);

      const sign = await request(app.getHttpServer())
        .post(`/records/encounters/${encounter.body.id}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());
      expect(sign.status).toBe(201);

      const updatedAppt = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.body.id } });
      expect(updatedAppt.status).toBe("COMPLETED");
      expect(updatedAppt.completedWithoutNoteReason).toBeNull();

      const detail = await request(app.getHttpServer())
        .get(`/appointments/${appt.body.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.patient.firstName).toBe("Luis");
      expect(detail.body.encounter.status).toBe("SIGNED");
    });

    it("no falla si el encounter no tiene cita ligada", async () => {
      const doctor = await registerDoctor();
      const patientId = await createPatient(doctor.accessToken);

      const encounter = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/encounters`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, encounterType: "FIRST_VISIT" });
      expect(encounter.status).toBe(201);

      const sign = await request(app.getHttpServer())
        .post(`/records/encounters/${encounter.body.id}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());
      expect(sign.status).toBe(201);
    });

    it("no falla si la cita ligada no está IN_PROGRESS (queda como estaba)", async () => {
      const doctor = await registerDoctor();
      const serviceId = await createService(doctor.accessToken);
      const patientId = await createPatient(doctor.accessToken);

      const appt = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, serviceId, startsAt: isoDaysFromNow(1) });
      await appointmentService.confirmPayment(appt.body.id, doctor.userId);
      // Nunca se llama start() — se queda en SCHEDULED.

      const encounter = await request(app.getHttpServer())
        .post(`/records/patients/${patientId}/encounters`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId, appointmentId: appt.body.id, encounterType: "FIRST_VISIT" });

      const sign = await request(app.getHttpServer())
        .post(`/records/encounters/${encounter.body.id}/sign`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send(signPayload());
      expect(sign.status).toBe(201);

      const updatedAppt = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.body.id } });
      expect(updatedAppt.status).toBe("SCHEDULED");
    });
  });
});
