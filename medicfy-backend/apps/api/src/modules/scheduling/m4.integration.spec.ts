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
import { addDaysToDateString, todayInTimeZone } from "./timezone";

class TestNotificationAdapter implements NotificationPort {
  public readonly emailCodes = new Map<string, string>();
  public readonly invitationUrls = new Map<string, string>();
  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.emailCodes.set(to, code);
  }
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(to: string, url: string): Promise<void> {
    this.invitationUrls.set(to, url);
  }
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

// Bug real encontrado en Sprint 5c: esta función calculaba la fecha
// en UTC, pero validFrom se compara contra días calendario en
// America/Mexico_City (zonedDateAndMinutesToUtc, computeSlots). Entre
// las 18:00 y las 23:59 hora de México, UTC ya cambió de día — una
// regla creada con el "hoy" de esta función quedaba con validFrom un
// día adelantado, excluyendo en silencio el resto del día real. Ahora
// delega en los mismos helpers que usa el servicio, para no poder
// volver a desincronizarse de la zona horaria real del sistema.
function dateOnly(offsetDays: number): string {
  return addDaysToDateString(todayInTimeZone(), offsetDays);
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

describe("M4 — Agenda y disponibilidad", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let notifications: TestNotificationAdapter;

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
    notifications = notificationAdapter;
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
    const code = notifications.emailCodes.get(email);
    if (!code) {
      throw new Error("expected an email verification code to have been issued");
    }
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function registerPatient(): Promise<{ userId: string; email: string; accessToken: string }> {
    const email = uniqueEmail("patient");
    const res = await request(app.getHttpServer())
      .post("/auth/register/patient")
      .send({
        email,
        password: STRONG_PASSWORD,
        phone: uniquePhone(),
        consents: { privacyNotice: true, sensitiveData: true, digitalPrescriptionChannel: false },
      });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "PATIENT" });
    return { userId, email, accessToken };
  }

  // DT-03: goes through the real invite -> accept HTTP flow (a test
  // that goes through a shortcut only verifies the shortcut). The
  // doctor invites the assistant's email; the invitation URL captured
  // by TestNotificationAdapter carries the real token in its query
  // string; the assistant (already authenticated, e.g. as a patient —
  // there's no dedicated ASSISTANT registration path) accepts it.
  async function acceptAssistantInvitation(
    doctorAccessToken: string,
    assistant: { email: string; accessToken: string }
  ): Promise<void> {
    const invite = await request(app.getHttpServer())
      .post("/doctors/me/assistants/invite")
      .set("Authorization", `Bearer ${doctorAccessToken}`)
      .send({ email: assistant.email });
    expect(invite.status).toBe(200);

    const invitationUrl = notifications.invitationUrls.get(assistant.email);
    if (!invitationUrl) {
      throw new Error("expected an assistant invitation URL to have been issued");
    }
    const token = new URL(invitationUrl).searchParams.get("token");
    if (!token) {
      throw new Error("expected the invitation URL to carry a token query param");
    }

    const accept = await request(app.getHttpServer())
      .post("/doctors/me/assistants/accept")
      .set("Authorization", `Bearer ${assistant.accessToken}`)
      .send({ token });
    expect(accept.status).toBe(200);
    expect(accept.body.accepted).toBe(true);
  }

  async function createService(
    accessToken: string,
    overrides?: { serviceType?: "FIRST_VISIT" | "TELECONSULTATION"; durationMinutes?: number }
  ): Promise<{ id: string; durationMinutes: number }> {
    const res = await request(app.getHttpServer())
      .post("/doctors/me/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        serviceType: overrides?.serviceType ?? "FIRST_VISIT",
        name: "Consulta",
        durationMinutes: overrides?.durationMinutes ?? 30,
        priceMxn: 500,
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, durationMinutes: res.body.durationMinutes as number };
  }

  describe("M4-RN-004 — reglas solapadas se rechazan", () => {
    it("creates a valid availability rule", async () => {
      const { accessToken } = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          modality: "IN_PERSON",
          weekday: 1,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          bufferMinutes: 10,
          validFrom: dateOnly(0),
        });
      expect(res.status).toBe(201);
      expect(res.body.startMinute).toBe(9 * 60);
      expect(res.body.endMinute).toBe(12 * 60);
    });

    it("rejects an overlapping rule for the same doctor, modality and weekday (409)", async () => {
      const { accessToken } = await registerDoctor();
      const first = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 2, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(first.status).toBe(201);

      const overlapping = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 2, startTime: "10:00", endTime: "13:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(overlapping.status).toBe(409);
      expect(overlapping.body.error.code).toBe("AVAILABILITY_RULE_OVERLAP");
      expect(overlapping.body.error.details.conflictingRuleId).toBe(first.body.id);
    });

    it("allows a non-overlapping rule on a different weekday", async () => {
      const { accessToken } = await registerDoctor();
      const first = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 3, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(first.status).toBe(201);

      const otherWeekday = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 4, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(otherWeekday.status).toBe(201);
    });

    it("allows an overlapping time range when the modality differs", async () => {
      const { accessToken } = await registerDoctor();
      const first = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 5, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(first.status).toBe(201);

      const otherModality = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "ONLINE", weekday: 5, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(otherModality.status).toBe(201);
    });

    it("re-validates the overlap on update (PATCH) when the rule stays active", async () => {
      const { accessToken } = await registerDoctor();
      const first = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 6, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      const second = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 6, startTime: "11:00", endTime: "12:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const movedIntoConflict = await request(app.getHttpServer())
        .patch(`/doctors/me/availability-rules/${second.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ startTime: "09:30" });
      expect(movedIntoConflict.status).toBe(409);
      expect(movedIntoConflict.body.error.code).toBe("AVAILABILITY_RULE_OVERLAP");
    });
  });

  describe("Validaciones", () => {
    it("rejects startTime >= endTime (400)", async () => {
      const { accessToken } = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 1, startTime: "12:00", endTime: "09:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(res.status).toBe(400);
    });

    it("rejects slotDurationMinutes outside 5-240 (400)", async () => {
      const { accessToken } = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 300, validFrom: dateOnly(0) });
      expect(res.status).toBe(400);
    });

    it("rejects bufferMinutes outside 0-60 (400)", async () => {
      const { accessToken } = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          modality: "IN_PERSON",
          weekday: 1,
          startTime: "09:00",
          endTime: "12:00",
          slotDurationMinutes: 30,
          bufferMinutes: 70,
          validFrom: dateOnly(0),
        });
      expect(res.status).toBe(400);
    });

    it("rejects an exception block longer than 365 days (400)", async () => {
      const { accessToken } = await registerDoctor();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
          blocksAllDay: true,
        });
      expect(res.status).toBe(400);
    });
  });

  describe("Autorización — DOCTOR o ASSISTANT con vínculo, nadie más", () => {
    it("an ASSISTANT scoped to the doctor can create a rule on the doctor's behalf", async () => {
      const doctor = await registerDoctor();
      const assistant = await registerPatient();
      await acceptAssistantInvitation(doctor.accessToken, assistant);

      const created = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${assistant.accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 1, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(created.status).toBe(201);

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      expect(created.body.doctorId).toBe(doctorRecord.id);

      const listedByDoctor = await request(app.getHttpServer())
        .get("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${doctor.accessToken}`);
      expect(listedByDoctor.status).toBe(200);
      expect(listedByDoctor.body.some((r: { id: string }) => r.id === created.body.id)).toBe(true);
    });

    it("rejects a caller with no doctor/assistant relationship (403)", async () => {
      const { accessToken } = await registerPatient();
      const res = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ modality: "IN_PERSON", weekday: 1, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("SCHEDULING_NOT_DOCTOR_OR_ASSISTANT");
    });

    it("rejects an unauthenticated caller (401)", async () => {
      const res = await request(app.getHttpServer()).get("/doctors/me/availability-rules");
      expect(res.status).toBe(401);
    });
  });

  describe("M4-CA-004 — espacios respetan antelación mínima y buffers", () => {
    it("never returns a slot earlier than the doctor's minBookingNoticeMinutes (default 120)", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken, { durationMinutes: 15 });
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      expect(doctorRecord.minBookingNoticeMinutes).toBe(120);

      for (let weekday = 0; weekday <= 6; weekday++) {
        const rule = await request(app.getHttpServer())
          .post("/doctors/me/availability-rules")
          .set("Authorization", `Bearer ${doctor.accessToken}`)
          .send({
            modality: "IN_PERSON",
            weekday,
            startTime: "00:00",
            endTime: "23:45",
            slotDurationMinutes: 15,
            validFrom: dateOnly(0),
          });
        expect(rule.status).toBe(201);
      }

      const res = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${dateOnly(0)}&to=${dateOnly(1)}&service_id=${service.id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      const now = Date.now();
      const earliestReturned = Math.min(...res.body.map((s: { startAt: string }) => new Date(s.startAt).getTime()));
      // 118 min instead of 120 to absorb the few seconds this test takes to run.
      expect(earliestReturned).toBeGreaterThanOrEqual(now + 118 * 60 * 1000);
      // The next 15-min grid slot after the 120-min boundary should
      // appear — proves the cutoff isn't massively over-conservative.
      expect(earliestReturned).toBeLessThan(now + 120 * 60 * 1000 + 16 * 60 * 1000);
    });

    it("includes a slot when the rule's window exactly fits service duration + buffer", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken, { durationMinutes: 30 });
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const targetDate = dateOnly(10);
      const weekday = weekdayOf(targetDate);

      const rule = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          modality: "IN_PERSON",
          weekday,
          startTime: "10:00",
          endTime: "10:40",
          slotDurationMinutes: 40,
          bufferMinutes: 10,
          validFrom: dateOnly(0),
        });
      expect(rule.status).toBe(201);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${service.id}`
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("excludes the slot when the rule's window is one minute short of duration + buffer", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken, { durationMinutes: 30 });
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const targetDate = dateOnly(11);
      const weekday = weekdayOf(targetDate);

      const rule = await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({
          modality: "IN_PERSON",
          weekday,
          startTime: "10:00",
          endTime: "10:39",
          slotDurationMinutes: 39,
          bufferMinutes: 10,
          validFrom: dateOnly(0),
        });
      expect(rule.status).toBe(201);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${service.id}`
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it("excludes any slot overlapping an availability exception", async () => {
      const doctor = await registerDoctor();
      const service = await createService(doctor.accessToken, { durationMinutes: 30 });
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const targetDate = dateOnly(12);
      const weekday = weekdayOf(targetDate);

      await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ modality: "IN_PERSON", weekday, startTime: "09:00", endTime: "11:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });

      const beforeException = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${service.id}`
      );
      expect(beforeException.body.length).toBeGreaterThan(0);

      const exception = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ startAt: `${targetDate}T00:00:00.000Z`, endAt: `${targetDate}T23:59:00.000Z`, blocksAllDay: true, reason: "Vacaciones" });
      expect(exception.status).toBe(201);

      const afterException = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${service.id}`
      );
      expect(afterException.body).toHaveLength(0);
    });

    it("only matches TELECONSULTATION services against ONLINE rules, and other service types against IN_PERSON rules", async () => {
      const doctor = await registerDoctor();
      const inPersonService = await createService(doctor.accessToken, { serviceType: "FIRST_VISIT", durationMinutes: 30 });
      const teleService = await createService(doctor.accessToken, { serviceType: "TELECONSULTATION", durationMinutes: 30 });
      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const targetDate = dateOnly(13);
      const weekday = weekdayOf(targetDate);

      await request(app.getHttpServer())
        .post("/doctors/me/availability-rules")
        .set("Authorization", `Bearer ${doctor.accessToken}`)
        .send({ modality: "ONLINE", weekday, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30, validFrom: dateOnly(0) });

      const inPersonSlots = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${inPersonService.id}`
      );
      expect(inPersonSlots.body).toHaveLength(0);

      const teleSlots = await request(app.getHttpServer()).get(
        `/doctors/${doctorRecord.id}/availability?from=${targetDate}&to=${targetDate}&service_id=${teleService.id}`
      );
      expect(teleSlots.body.length).toBeGreaterThan(0);
    });
  });

  describe("Excepciones — CRUD", () => {
    it("creates, lists, and deletes an exception", async () => {
      const { accessToken } = await registerDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          reason: "Congreso médico",
          blocksAllDay: true,
        });
      expect(create.status).toBe(201);

      const list = await request(app.getHttpServer())
        .get("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(list.body.some((e: { id: string }) => e.id === create.body.id)).toBe(true);

      const remove = await request(app.getHttpServer())
        .delete(`/doctors/me/availability-exceptions/${create.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(remove.status).toBe(200);

      const listAfter = await request(app.getHttpServer())
        .get("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(listAfter.body.some((e: { id: string }) => e.id === create.body.id)).toBe(false);
    });

    it("stores startAt/endAt as real TIMESTAMPTZ instants, round-tripping exactly (M4-RN-001)", async () => {
      const { accessToken, userId } = await registerDoctor();
      const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

      const create = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      expect(create.status).toBe(201);

      const doctorRecord = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
      const stored = await prisma.availabilityException.findFirstOrThrow({ where: { doctorId: doctorRecord.id } });
      expect(stored.startAt.getTime()).toBe(startAt.getTime());
      expect(stored.endAt.getTime()).toBe(endAt.getTime());
    });

    it("404s deleting an exception that doesn't belong to the caller", async () => {
      const owner = await registerDoctor();
      const stranger = await registerDoctor();
      const create = await request(app.getHttpServer())
        .post("/doctors/me/availability-exceptions")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3_600_000).toISOString(),
        });

      const res = await request(app.getHttpServer())
        .delete(`/doctors/me/availability-exceptions/${create.body.id}`)
        .set("Authorization", `Bearer ${stranger.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  it.todo(
    "M4-CA-001: 50 parallel requests for the same slot -> exactly 1 success, 49 SLOT_TAKEN. Needs a real POST /appointments booking mutation with the EXCLUDE USING gist constraint from §6.4, which requires `appointments` + `patients` — both explicitly assigned to M5, not M4 (v2.1 §17: \"M4 gestiona disponibilidad del médico y no requiere pacientes\")."
  );

  it.todo(
    "M4-CA-003: an exception never silently cancels already-booked appointments; it must list affected appointments and require an explicit per-appointment decision. Needs `appointments` to exist (M5) — there is nothing to cancel yet, so this can't be proven true or false today."
  );
});
