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

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// M3 (spec §7, v2.3/v2.4) — directorio y búsqueda de médicos.
describe("M3 — directorio y búsqueda pública de médicos", () => {
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

  async function registerAndVerifyDoctor(displayName: string): Promise<{ userId: string; accessToken: string }> {
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
    if (!code) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    await request(app.getHttpServer()).patch("/doctors/me").set("Authorization", `Bearer ${accessToken}`).send({ displayName });
    return { userId, accessToken };
  }

  describe("M3-CA-001/002 — nunca precio, nunca estados no elegibles", () => {
    it("no incluye precio en la respuesta, y excluye a un médico SUSPENDED", async () => {
      // q=<sufijo único> en vez de la primera página sin filtro: el
      // dev DB acumula médicos "Dr. Visible ..." de corridas previas
      // de esta suite, y displayName ordena alfabéticamente — sin
      // filtrar, el médico recién creado puede quedar fuera de los
      // primeros 20 resultados (mismo hallazgo que M3-RN-002 abajo).
      const uniqueSuffix = randomUUID();
      const doctor = await registerAndVerifyDoctor(`Dr. Visible ${uniqueSuffix}`);
      const suspended = await registerAndVerifyDoctor(`Dr. Suspendido ${uniqueSuffix}`);
      await prisma.doctor.update({ where: { userId: suspended.userId }, data: { verificationStatus: "SUSPENDED" } });

      const res = await request(app.getHttpServer()).get("/doctors/public").query({ q: uniqueSuffix });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/price/i);

      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const suspendedRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: suspended.userId } });
      const ids = res.body.items.map((d: { id: string }) => d.id);
      expect(ids).toContain(doctorRow.id);
      expect(ids).not.toContain(suspendedRow.id);
    });

    it("un médico DRAFT o REJECTED tampoco aparece", async () => {
      const draft = await registerAndVerifyDoctor(`Dr. Draft ${randomUUID()}`);
      await prisma.doctor.update({ where: { userId: draft.userId }, data: { verificationStatus: "DRAFT" } });
      const rejected = await registerAndVerifyDoctor(`Dr. Rechazado ${randomUUID()}`);
      await prisma.doctor.update({ where: { userId: rejected.userId }, data: { verificationStatus: "REJECTED" } });

      const res = await request(app.getHttpServer()).get("/doctors/public");
      const draftRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: draft.userId } });
      const rejectedRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: rejected.userId } });
      const ids = res.body.items.map((d: { id: string }) => d.id);
      expect(ids).not.toContain(draftRow.id);
      expect(ids).not.toContain(rejectedRow.id);
    });
  });

  describe("M3-RN-002 — q coincide con el nombre de la especialidad, no solo con displayName", () => {
    it("buscar por un fragmento del nombre de la especialidad encuentra al médico", async () => {
      const tag = randomUUID().slice(0, 8);
      const doctor = await registerAndVerifyDoctor(`Sin relación con la especialidad ${tag}`);
      const doctorRow = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctor.userId } });
      const specialty = await prisma.specialty.findUniqueOrThrow({ where: { id: doctorRow.primarySpecialtyId! } });

      // La base de dev acumula muchos médicos "Medicina General" de
      // pruebas previas de esta sesión — se recorre por cursor en vez
      // de asumir que cabe en la primera página.
      let found = false;
      let cursor: string | undefined;
      for (let i = 0; i < 40 && !found; i++) {
        const qs = new URLSearchParams({ q: specialty.nameEs, limit: "50" });
        if (cursor) qs.set("cursor", cursor);
        const res = await request(app.getHttpServer()).get(`/doctors/public?${qs.toString()}`);
        expect(res.status).toBe(200);
        found = res.body.items.some((d: { id: string }) => d.id === doctorRow.id);
        if (!res.body.nextCursor) break;
        cursor = res.body.nextCursor;
      }
      expect(found).toBe(true);
    });
  });

  describe("M3-CA-003 — especialidad inexistente no produce 500", () => {
    it("regresa 200 con lista vacía o ignorando el filtro", async () => {
      const res = await request(app.getHttpServer()).get("/doctors/public?specialty=NO_EXISTE_ESTE_CODIGO");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe("M3-CA-004 — paginación por cursor sin repetir ni omitir", () => {
    it("dos páginas de tamaño 2 cubren exactamente 3 médicos nuevos sin duplicados", async () => {
      const tag = randomUUID().slice(0, 8);
      const names = [`AAA-${tag}`, `BBB-${tag}`, `CCC-${tag}`];
      for (const name of names) {
        await registerAndVerifyDoctor(name);
      }

      const page1 = await request(app.getHttpServer()).get(`/doctors/public?q=${tag}&limit=2`);
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();

      const page2 = await request(app.getHttpServer()).get(`/doctors/public?q=${tag}&limit=2&cursor=${page1.body.nextCursor}`);
      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const allNames = [...page1.body.items, ...page2.body.items].map((d: { displayName: string }) => d.displayName);
      expect(new Set(allNames).size).toBe(3);
      expect(allNames.sort()).toEqual(names.sort());
    });
  });

  describe("M3-CA-005 — filtros sobre campos reales", () => {
    it("teleconsultation=true excluye a un médico con acceptsTeleconsultation=false", async () => {
      const tag = randomUUID().slice(0, 8);
      const withTele = await registerAndVerifyDoctor(`Tele-Si-${tag}`);
      await prisma.doctor.update({ where: { userId: withTele.userId }, data: { acceptsTeleconsultation: true } });
      const withoutTele = await registerAndVerifyDoctor(`Tele-No-${tag}`);
      await prisma.doctor.update({ where: { userId: withoutTele.userId }, data: { acceptsTeleconsultation: false } });

      const res = await request(app.getHttpServer()).get(`/doctors/public?q=${tag}&teleconsultation=true`);
      expect(res.status).toBe(200);
      const names = res.body.items.map((d: { displayName: string }) => d.displayName);
      expect(names).toContain(`Tele-Si-${tag}`);
      expect(names).not.toContain(`Tele-No-${tag}`);
    });

    it("location= excluye a un médico sin ningún practice_location activo que coincida", async () => {
      const tag = randomUUID().slice(0, 8);
      const inGdl = await registerAndVerifyDoctor(`Loc-GDL-${tag}`);
      await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${inGdl.accessToken}`)
        .send({ name: "Consultorio GDL", addressMunicipality: "Guadalajara" });
      const inCdmx = await registerAndVerifyDoctor(`Loc-CDMX-${tag}`);
      await request(app.getHttpServer())
        .post("/doctors/me/locations")
        .set("Authorization", `Bearer ${inCdmx.accessToken}`)
        .send({ name: "Consultorio CDMX", addressMunicipality: "Ciudad de México" });

      const res = await request(app.getHttpServer()).get(`/doctors/public?q=${tag}&location=Guadalajara`);
      expect(res.status).toBe(200);
      const names = res.body.items.map((d: { displayName: string }) => d.displayName);
      expect(names).toContain(`Loc-GDL-${tag}`);
      expect(names).not.toContain(`Loc-CDMX-${tag}`);
    });
  });
});

// M3-RN-007 (v2.4) — "Tus médicos".
describe("M3-RN-007 — GET /patients/me/doctors", () => {
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

  async function registerPatient(): Promise<{ patientId: string; accessToken: string }> {
    const email = uniqueEmail("patient");
    const res = await request(app.getHttpServer())
      .post("/auth/register/patient")
      .send({
        email,
        password: STRONG_PASSWORD,
        phone: uniquePhone(),
        firstName: "Karla",
        lastNamePaternal: "Núñez",
        birthDate: "1990-01-01",
        sexAtBirth: "F",
        consents: { privacyNotice: true, sensitiveData: true, digitalPrescriptionChannel: false },
      });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const code = notifications.emailCodes.get(email);
    if (!code) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId, code });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "PATIENT" });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { userId } });
    return { patientId: patient.id, accessToken };
  }

  it("M3-CA-006 — sin care_relationship activo devuelve lista vacía, no error", async () => {
    const patient = await registerPatient();
    const res = await request(app.getHttpServer()).get("/patients/me/doctors").set("Authorization", `Bearer ${patient.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("devuelve el médico una vez que existe un care_relationship activo", async () => {
    const patient = await registerPatient();
    const doctorEmail = uniqueEmail("doctor");
    const doctorRes = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: doctorEmail,
      password: STRONG_PASSWORD,
      legalFirstName: "Mario",
      legalLastName: "Reyes",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    const doctorUserId = doctorRes.body.userId as string;
    const doctorCode = notifications.emailCodes.get(doctorEmail);
    if (!doctorCode) throw new Error("expected an email verification code");
    await request(app.getHttpServer()).post("/auth/email/verify").send({ userId: doctorUserId, code: doctorCode });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctorUserId } });

    await prisma.careRelationship.create({
      data: { patientId: patient.patientId, doctorId: doctor.id, origin: "APPOINTMENT", expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const res = await request(app.getHttpServer()).get("/patients/me/doctors").set("Authorization", `Bearer ${patient.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(doctor.id);
    expect(res.body[0].slug).toBe(doctor.slug);
    expect(JSON.stringify(res.body)).not.toMatch(/price|subscriptionPlan|verificationNotes/i);
  });
});
