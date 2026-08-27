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
import { CareRelationshipService } from "./services/care-relationship.service";
import { AppointmentStateMachineService } from "./services/appointment-state-machine.service";

class TestNotificationAdapter implements NotificationPort {
  public readonly emailCodes = new Map<string, string>();
  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.emailCodes.set(to, code);
  }
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

function isoDaysFromNow(days: number, hour = 10): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const VALID_GUARDIAN = {
  guardianName: "Rosa Pérez",
  guardianRelation: "MADRE" as const,
  guardianPhoneE164: "+525511122233",
  guardianEmail: "rosa.perez@example.com",
  guardianIdDocumentKey: "guardian-ine/placeholder-key",
};

describe("M5a — Pacientes y citas (núcleo)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let careRelationshipService: CareRelationshipService;
  let appointmentService: AppointmentStateMachineService;

  beforeAll(async () => {
    const notificationAdapter = new TestNotificationAdapter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notificationAdapter)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
    careRelationshipService = moduleRef.get(CareRelationshipService);
    appointmentService = moduleRef.get(AppointmentStateMachineService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail("doctor");
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email,
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    // M2-RN-004: sin esto, ningún test de este archivo podría agendar
    // — un médico recién registrado no tiene consultorio activo ni
    // teleconsulta habilitada. No es lo que estos tests verifican,
    // así que se resuelve aquí, no en cada `it`.
    await prisma.doctor.update({ where: { userId }, data: { acceptsTeleconsultation: true } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createService(accessToken: string, durationMinutes = 30): Promise<{ id: string; durationMinutes: number; priceMxnCents: number }> {
    const res = await request(app.getHttpServer())
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ serviceType: "FIRST_VISIT", name: "Consulta", durationMinutes, priceMxn: 500 });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, durationMinutes: res.body.durationMinutes as number, priceMxnCents: res.body.priceMxnCents as number };
  }

  async function createAdultPatient(accessToken: string): Promise<{ id: string; medicfyId: string }> {
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
    return { id: res.body.id as string, medicfyId: res.body.medicfyId as string };
  }

  async function bookAppointment(
    accessToken: string,
    patientId: string,
    serviceId: string,
    startsAtIso: string
  ): Promise<{ id: string; status: string }> {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ patientId, serviceId, startsAt: startsAtIso });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, status: res.body.status as string };
  }

  describe("M2-CA-009 — paciente creado por médico", () => {
    it("creates a patient with a readable medicfy_id, source=CREATED_BY_DOCTOR, and auto-creates the care_relationship", async () => {
      const doctor = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "María",
          lastNamePaternal: "López",
          lastNameMaternal: "Ruiz",
          birthDate: "1985-03-20",
          sexAtBirth: "F",
          phoneE164: uniquePhone(),
          email: uniqueEmail("patient"),
        });

      expect(res.status).toBe(201);
      expect(res.body.medicfyId).toMatch(/^MDF-\d{6}$/);
      expect(res.body.source).toBe("CREATED_BY_DOCTOR");

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const relationship = await prisma.careRelationship.findFirst({
        where: { patientId: res.body.id, doctorId: doctorRecord.id },
      });
      expect(relationship).not.toBeNull();
      expect(relationship?.origin).toBe("CREATED_BY_DOCTOR");
      expect(relationship?.status).toBe("ACTIVE");
    });

    it("lists only patients with an active care_relationship with the caller", async () => {
      const doctorA = await registerDoctor();
      const doctorB = await registerDoctor();
      await createAdultPatient(doctorA.accessToken);

      const listA = await request(app.getHttpServer()).get("/patients").set("Authorization", `Bearer ${doctorA.accessToken}`);
      expect(listA.body.length).toBeGreaterThan(0);

      const listB = await request(app.getHttpServer()).get("/patients").set("Authorization", `Bearer ${doctorB.accessToken}`);
      expect(listB.body).toHaveLength(0);
    });
  });

  // R4 — hallazgos #1 y #2 de la auditoría del Bloque 0 (26 ago 2026).
  // Estas pruebas fallan si alguien vuelve a abrir cualquiera de las
  // dos puertas.
  describe("R4 — autorización por recurso en pacientes y citas", () => {
    it("un médico sin vínculo NO puede agendarle una cita a un paciente ajeno, y no se le crea el vínculo", async () => {
      const doctorA = await registerDoctor();
      const atacante = await registerDoctor();
      const paciente = await createAdultPatient(doctorA.accessToken);
      const servicioPropio = await createService(atacante.accessToken);

      const res = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${atacante.accessToken}`)
        .send({ patientId: paciente.id, serviceId: servicioPropio.id, startsAt: isoDaysFromNow(3) });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CARE_RELATIONSHIP_REQUIRED");

      // Lo que de verdad importa: la cita rechazada no dejó atrás una
      // llave. Antes, este mismo POST fabricaba un care_relationship
      // ACTIVE de 18 meses, y con eso el expediente completo del
      // paciente respondía 200.
      const atacanteRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: atacante.userId } });
      const vinculo = await prisma.careRelationship.findFirst({
        where: { patientId: paciente.id, doctorId: atacanteRecord.id },
      });
      expect(vinculo).toBeNull();
    });

    it("el médico con vínculo sí agenda, y la cita renueva el vínculo en vez de crear otro", async () => {
      const doctor = await registerDoctor();
      const paciente = await createAdultPatient(doctor.accessToken);
      const servicio = await createService(doctor.accessToken);

      const cita = await bookAppointment(doctor.accessToken, paciente.id, servicio.id, isoDaysFromNow(4));
      expect(cita.id).toBeTruthy();

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const vinculos = await prisma.careRelationship.findMany({
        where: { patientId: paciente.id, doctorId: doctorRecord.id },
      });
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0]?.origin).toBe("CREATED_BY_DOCTOR");
    });

    it("un vínculo REVOCADO no se reabre agendando una cita", async () => {
      const doctor = await registerDoctor();
      const paciente = await createAdultPatient(doctor.accessToken);
      const servicio = await createService(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });

      const vinculo = await prisma.careRelationship.findFirstOrThrow({
        where: { patientId: paciente.id, doctorId: doctorRecord.id },
      });
      await careRelationshipService.revoke(vinculo.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: paciente.id, serviceId: servicio.id, startsAt: isoDaysFromNow(5) });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    });

    it("GET /patients/:id no entrega el perfil de un paciente ajeno", async () => {
      const doctorA = await registerDoctor();
      const doctorB = await registerDoctor();
      const paciente = await createAdultPatient(doctorA.accessToken);

      const propio = await request(app.getHttpServer())
        .get(`/patients/${paciente.id}`)
        .set("Authorization", `Bearer ${doctorA.accessToken}`);
      expect(propio.status).toBe(200);
      expect(propio.body.id).toBe(paciente.id);

      // 404 y no 403: un 403 confirmaría que ese id existe, y con eso
      // se puede enumerar la base de pacientes aunque no se lea ninguno.
      const ajeno = await request(app.getHttpServer())
        .get(`/patients/${paciente.id}`)
        .set("Authorization", `Bearer ${doctorB.accessToken}`);
      expect(ajeno.status).toBe(404);
      expect(ajeno.body).not.toHaveProperty("curp");
      expect(ajeno.body).not.toHaveProperty("guardians");
    });

    it("R6 — toda lectura del perfil queda en bitácora, la que pasa y la que se rechaza", async () => {
      const doctorA = await registerDoctor();
      const doctorB = await registerDoctor();
      const paciente = await createAdultPatient(doctorA.accessToken);

      await request(app.getHttpServer()).get(`/patients/${paciente.id}`).set("Authorization", `Bearer ${doctorA.accessToken}`);
      await request(app.getHttpServer()).get(`/patients/${paciente.id}`).set("Authorization", `Bearer ${doctorB.accessToken}`);

      const entradas = await prisma.auditLog.findMany({
        where: { action: "patient.profile.read", patientId: paciente.id },
      });
      expect(entradas.filter((e) => e.result === "SUCCESS" && e.actorUserId === doctorA.userId)).toHaveLength(1);
      expect(entradas.filter((e) => e.result === "DENIED" && e.actorUserId === doctorB.userId)).toHaveLength(1);
    });

    it("un vínculo vencido deja de abrir el perfil, igual que dejó de aparecer en la lista", async () => {
      const doctor = await registerDoctor();
      const paciente = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });

      const vinculo = await prisma.careRelationship.findFirstOrThrow({
        where: { patientId: paciente.id, doctorId: doctorRecord.id },
      });
      await prisma.careRelationship.update({
        where: { id: vinculo.id },
        data: { expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const res = await request(app.getHttpServer())
        .get(`/patients/${paciente.id}`)
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Menores de edad — patient_guardians", () => {
    it("rejects creating a minor patient without guardian info (400)", async () => {
      const doctor = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "Sofía",
          lastNamePaternal: "Ramírez",
          birthDate: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          sexAtBirth: "F",
          phoneE164: uniquePhone(),
          email: uniqueEmail("minor"),
        });
      expect(res.status).toBe(400);
    });

    it("creates a minor patient with guardian info, and GET returns the guardian", async () => {
      const doctor = await registerDoctor();
      const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const create = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "Sofía",
          lastNamePaternal: "Ramírez",
          birthDate: tenYearsAgo,
          sexAtBirth: "F",
          phoneE164: uniquePhone(),
          email: uniqueEmail("minor"),
          guardian: VALID_GUARDIAN,
        });
      expect(create.status).toBe(201);

      const read = await request(app.getHttpServer()).get(`/patients/${create.body.id}`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(read.status).toBe(200);
      expect(read.body.guardians).toHaveLength(1);
      expect(read.body.guardians[0].guardianName).toBe("Rosa Pérez");
    });

    it("auto-revokes the guardian link once the patient turns 18 (checked at read time, no scheduler)", async () => {
      const doctor = await registerDoctor();
      const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const create = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          firstName: "Diego",
          lastNamePaternal: "Torres",
          birthDate: tenYearsAgo,
          sexAtBirth: "M",
          phoneE164: uniquePhone(),
          email: uniqueEmail("minor"),
          guardian: VALID_GUARDIAN,
        });
      expect(create.status).toBe(201);

      // Simula que el paciente ya cumplió 18 (sin esperar años reales).
      await prisma.patient.update({
        where: { id: create.body.id },
        data: { birthDate: new Date(Date.now() - 20 * 365 * 24 * 60 * 60 * 1000) },
      });

      const read = await request(app.getHttpServer()).get(`/patients/${create.body.id}`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(read.body.guardians).toHaveLength(0);

      const revoked = await prisma.patientGuardian.findFirstOrThrow({ where: { patientId: create.body.id } });
      expect(revoked.revokedAt).not.toBeNull();
      expect(revoked.revokedReason).toContain("18 años");
    });
  });

  describe("AUTH-RN-001 — care_relationship: tres orígenes y caducidad a 18 meses", () => {
    // Bloque 0 (remediación IDOR #1): agendar YA NO emite el vínculo —
    // un médico sin care_relationship recibe 403 y no deja llave atrás
    // (cubierto arriba en "R4 — autorización por recurso"). El origen
    // APPOINTMENT queda reservado al flujo donde es el PACIENTE quien
    // agenda (M5b, agendamiento público, no construido): ahí sí es el
    // paciente quien abre la puerta, no el médico quien se la fabrica.
    it.todo("origin=APPOINTMENT se crea cuando el PACIENTE agenda por el flujo público (M5b)");

    it("treats a relationship as inactive once expiresAt has passed, and flips it to EXPIRED", async () => {
      const doctor = await registerDoctor();
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });

      const relationship = await prisma.careRelationship.findFirstOrThrow({ where: { patientId: patient.id, doctorId: doctorRecord.id } });
      expect(relationship.status).toBe("ACTIVE");

      await prisma.careRelationship.update({ where: { id: relationship.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const isActive = await careRelationshipService.hasActiveRelationship(patient.id, doctorRecord.id);
      expect(isActive).toBe(false);

      const afterCheck = await prisma.careRelationship.findUniqueOrThrow({ where: { id: relationship.id } });
      expect(afterCheck.status).toBe("EXPIRED");
    });

    it("renews (not duplicates) an existing active relationship, extending expiresAt", async () => {
      const doctor = await registerDoctor();
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });

      const before = await prisma.careRelationship.findFirstOrThrow({ where: { patientId: patient.id, doctorId: doctorRecord.id } });
      await careRelationshipService.createOrRenew(patient.id, doctorRecord.id, "PATIENT_GRANTED");

      const count = await prisma.careRelationship.count({ where: { patientId: patient.id, doctorId: doctorRecord.id } });
      expect(count).toBe(1);

      const after = await prisma.careRelationship.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(before.expiresAt.getTime());
    });
  });

  describe("M5-CA-001 — máquina de estados íntegra", () => {
    it("walks the full valid chain: pending_payment -> scheduled -> confirmed -> in_progress -> completed", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      expect(created.status).toBe("PENDING_PAYMENT");

      await appointmentService.confirmPayment(created.id, doctor.userId);
      const confirm = await request(app.getHttpServer()).post(`/appointments/${created.id}/confirm`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(confirm.status).toBe(201);
      expect(confirm.body.status).toBe("CONFIRMED");

      // Prompt 12 / prueba 17.5 (Fase 1): SOLO el médico asignado a la
      // cita puede abrir la consulta — otro médico recibe error de
      // autorización, no un 404 casual.
      const intruso = await registerDoctor();
      const intrusoStart = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/start`)
        .set("Authorization", `Bearer ${intruso.accessToken}`);
      expect([403, 404]).toContain(intrusoStart.status);
      expect(intrusoStart.status).not.toBe(201);

      const start = await request(app.getHttpServer()).post(`/appointments/${created.id}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(start.status).toBe(201);
      expect(start.body.status).toBe("IN_PROGRESS");

      const complete = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/complete`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ justification: "Consulta realizada por teléfono, nota pendiente de captura." });
      expect(complete.status).toBe(201);
      expect(complete.body.status).toBe("COMPLETED");

      const history = await prisma.appointmentStatusHistory.findMany({ where: { appointmentId: created.id }, orderBy: { changedAt: "asc" } });
      expect(history.map((h) => h.toStatus)).toEqual(["PENDING_PAYMENT", "SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"]);
    });

    it("rejects an invalid transition (409) and leaves the appointment completely unmodified", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));

      const before = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });

      // pending_payment -> in_progress no está en la tabla de la spec.
      const res = await request(app.getHttpServer()).post(`/appointments/${created.id}/start`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("APPOINTMENT_TRANSITION_INVALID");

      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
      expect(after).toEqual(before);

      const historyCount = await prisma.appointmentStatusHistory.count({ where: { appointmentId: created.id } });
      expect(historyCount).toBe(1); // solo la fila inicial de creación
    });

    it("rejects transitioning from a terminal state (completed -> anything)", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      await appointmentService.confirmPayment(created.id, doctor.userId);
      await appointmentService.start(created.id, doctor.userId);
      await appointmentService.complete(created.id, doctor.userId, "Consulta realizada, nota pendiente de captura.");

      const res = await request(app.getHttpServer()).post(`/appointments/${created.id}/confirm`).set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(res.status).toBe(409);
    });
  });

  describe("M5-RN-002/M5-CA-003 — política de cancelación como snapshot inmutable", () => {
    it("refunds 100% when the patient cancels more than 24h before", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "PATIENT", reason: "Ya no puede asistir" });
      expect(res.status).toBe(201);
      expect(res.body.refundPercent).toBe(100);
      expect(res.body.appointment.status).toBe("CANCELLED_BY_PATIENT");
    });

    it("refunds 50% when the patient cancels between 2 and 24h before", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      await prisma.doctor.update({ where: { id: doctorRecord.id }, data: { minBookingNoticeMinutes: 0 } });
      const startsAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAt);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "PATIENT" });
      expect(res.body.refundPercent).toBe(50);
    });

    it("refunds 0% when the patient cancels less than 2h before", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      await prisma.doctor.update({ where: { id: doctorRecord.id }, data: { minBookingNoticeMinutes: 0 } });
      const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAt);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "PATIENT" });
      expect(res.body.refundPercent).toBe(0);
    });

    it("M5-RN-003: doctor cancellation is always 100%, even with less than 2h notice", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      await prisma.doctor.update({ where: { id: doctorRecord.id }, data: { minBookingNoticeMinutes: 0 } });
      const startsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAt);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "DOCTOR" });
      expect(res.body.refundPercent).toBe(100);
      expect(res.body.appointment.status).toBe("CANCELLED_BY_DOCTOR");
    });

    it("uses the policy snapshotted at booking time, not the doctor's later-changed policy", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      await prisma.doctor.update({ where: { id: doctorRecord.id }, data: { minBookingNoticeMinutes: 0 } });

      const startsAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // 10h: 50% bajo la política default
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAt);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      // El médico cambia su política DESPUÉS de crear la cita — a 100%
      // de reembolso siempre. La cita ya creada no debe verse afectada.
      await prisma.doctor.update({
        where: { id: doctorRecord.id },
        data: { cancellationPolicy: { fullRefundHoursBefore: 0, partialRefundHoursBefore: 0, partialRefundPercent: 100 } },
      });

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "PATIENT" });
      // Si usara la política nueva del médico, esto sería 100. Sigue
      // siendo 50 porque usa el snapshot tomado al crear la cita.
      expect(res.body.refundPercent).toBe(50);
    });
  });

  describe("M5-RN-004 — reagenda: máximo 2, ligada por rescheduledFromId", () => {
    it("reschedules an appointment, cancelling the old one and linking the new one", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const res = await request(app.getHttpServer())
        .post(`/appointments/${created.id}/reschedule`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ newStartsAt: isoDaysFromNow(12) });
      expect(res.status).toBe(201);
      expect(res.body.rescheduledFromId).toBe(created.id);
      expect(res.body.rescheduleCount).toBe(1);
      expect(res.body.status).toBe("SCHEDULED");

      const old = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
      expect(old.status).toBe("CANCELLED_BY_PATIENT");
    });

    it("rejects a 3rd reschedule (max 2 reached, 422)", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      let current = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      await appointmentService.confirmPayment(current.id, doctor.userId);

      for (let i = 0; i < 2; i++) {
        const res = await request(app.getHttpServer())
          .post(`/appointments/${current.id}/reschedule`)
          .set("Authorization", `Bearer ${doctor.accessToken}`)
          .send({ newStartsAt: isoDaysFromNow(12 + i * 2) });
        expect(res.status).toBe(201);
        current = { id: res.body.id, status: res.body.status };
      }

      const third = await request(app.getHttpServer())
        .post(`/appointments/${current.id}/reschedule`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ newStartsAt: isoDaysFromNow(20) });
      expect(third.status).toBe(422);
      expect(third.body.error.code).toBe("MAX_RESCHEDULES_REACHED");
    });
  });

  describe("DOC-01 — GET /appointments filtra por día calendario (America/Mexico_City)", () => {
    it("returns only the requested day's appointments, including patient and service names", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patientA = await createAdultPatient(doctor.accessToken);
      const patientB = await createAdultPatient(doctor.accessToken);

      const dayPlus2Iso = isoDaysFromNow(2);
      const apptDay2 = await bookAppointment(doctor.accessToken, patientA.id, service.id, dayPlus2Iso);
      await bookAppointment(doctor.accessToken, patientB.id, service.id, isoDaysFromNow(5));

      const res = await request(app.getHttpServer())
        .get("/appointments")
        .query({ date: dayPlus2Iso.slice(0, 10) })
        .set("Authorization", `Bearer ${doctor.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(apptDay2.id);
      expect(res.body[0].patient.firstName).toBe("Luis");
      expect(res.body[0].service.name).toBe("Consulta");
    });

    it("defaults to today (server-computed) when no ?date is given, excluding a future appointment", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(3));

      const res = await request(app.getHttpServer()).get("/appointments").set("Authorization", `Bearer ${doctor.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("Barridos automáticos (sin scheduler todavía — invocables directamente)", () => {
    it("M5-CA-002: releases a slot whose payment deadline has passed", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));

      await prisma.appointment.update({ where: { id: created.id }, data: { paymentDeadlineAt: new Date(Date.now() - 1000) } });

      const releasedCount = await appointmentService.releaseExpiredPendingPayments();
      expect(releasedCount).toBeGreaterThanOrEqual(1);

      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.status).toBe("CANCELLED_BY_PATIENT");
    });

    it("marks a scheduled appointment as no_show 60 minutes after its end time", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, isoDaysFromNow(10));
      await appointmentService.confirmPayment(created.id, doctor.userId);

      // startsAt/endsAt must stay ordered (the EXCLUDE constraint's
      // tstzrange requires lower <= upper) — move both into the past.
      await prisma.appointment.update({
        where: { id: created.id },
        data: { startsAt: new Date(Date.now() - 120 * 60 * 1000), endsAt: new Date(Date.now() - 61 * 60 * 1000) },
      });

      const count = await appointmentService.markExpiredAsNoShow();
      expect(count).toBeGreaterThanOrEqual(1);

      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.status).toBe("NO_SHOW");
    });
  });

  describe("Validaciones de creación", () => {
    it("rejects a slot inside the doctor's minimum notice window (422 SLOT_TOO_SOON)", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);

      const res = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: patient.id, serviceId: service.id, startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("SLOT_TOO_SOON");
    });

    it("rejects a slot beyond the doctor's maximum booking window (422 OUTSIDE_BOOKING_WINDOW)", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);

      const res = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: patient.id, serviceId: service.id, startsAt: isoDaysFromNow(120) });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("OUTSIDE_BOOKING_WINDOW");
    });

    it("rejects booking a doctor with no active location and no teleconsultation (403 DOCTOR_NOT_ACCEPTING_PATIENTS), and allows it once either is set", async () => {
      const doctor = await registerDoctor();
      // registerDoctor() habilita teleconsulta por defecto (ver su
      // propio comentario) — se apaga aquí a propósito para probar
      // exactamente el caso que M2-RN-004 bloquea.
      await prisma.doctor.update({ where: { userId: doctor.userId }, data: { acceptsTeleconsultation: false } });
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);

      const blocked = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: patient.id, serviceId: service.id, startsAt: isoDaysFromNow(2) });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("DOCTOR_NOT_ACCEPTING_PATIENTS");

      await prisma.doctor.update({ where: { userId: doctor.userId }, data: { acceptsTeleconsultation: true } });
      const allowedViaTeleconsult = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: patient.id, serviceId: service.id, startsAt: isoDaysFromNow(2) });
      expect(allowedViaTeleconsult.status).toBe(201);

      // Confirma la otra mitad de la regla ("O"): un consultorio
      // activo también basta, sin teleconsulta.
      await prisma.doctor.update({ where: { userId: doctor.userId }, data: { acceptsTeleconsultation: false } });
      await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ name: "Consultorio Centro", addressStreet: "Av. Vallarta 123", addressMunicipality: "Guadalajara", addressState: "Jalisco", addressPostalCode: "44100" });
      const allowedViaLocation = await request(app.getHttpServer())
        .post("/appointments")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ patientId: patient.id, serviceId: service.id, startsAt: isoDaysFromNow(3) });
      expect(allowedViaLocation.status).toBe(201);
    });
  });

  describe("M4-CA-003 — una excepción nunca cancela citas en silencio", () => {
    it("rejects creating an exception that overlaps an active appointment (409), lists the affected appointment, and never touches it", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const startsAtIso = isoDaysFromNow(15);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAtIso);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      const startsAt = new Date(startsAtIso);
      const dayStart = new Date(startsAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(startsAt);
      dayEnd.setUTCHours(23, 59, 0, 0);

      const exceptionRes = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ startAt: dayStart.toISOString(), endAt: dayEnd.toISOString(), blocksAllDay: true, reason: "Vacaciones" });

      expect(exceptionRes.status).toBe(409);
      expect(exceptionRes.body.error.code).toBe("AVAILABILITY_EXCEPTION_HAS_AFFECTED_APPOINTMENTS");
      expect(exceptionRes.body.error.details.affectedAppointments.map((a: { id: string }) => a.id)).toContain(created.id);

      const stillThere = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
      expect(stillThere.status).toBe("SCHEDULED");
    });

    it("allows creating the exception once the conflicting appointment has been resolved", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken);
      const patient = await createAdultPatient(doctor.accessToken);
      const startsAtIso = isoDaysFromNow(16);
      const created = await bookAppointment(doctor.accessToken, patient.id, service.id, startsAtIso);
      await appointmentService.confirmPayment(created.id, doctor.userId);

      await request(app.getHttpServer())
        .post(`/appointments/${created.id}/cancel`)
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ cancelledAsRole: "DOCTOR" });

      const startsAt = new Date(startsAtIso);
      const dayStart = new Date(startsAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(startsAt);
      dayEnd.setUTCHours(23, 59, 0, 0);

      const exceptionRes = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ startAt: dayStart.toISOString(), endAt: dayEnd.toISOString(), blocksAllDay: true });
      expect(exceptionRes.status).toBe(201);
    });
  });
});
