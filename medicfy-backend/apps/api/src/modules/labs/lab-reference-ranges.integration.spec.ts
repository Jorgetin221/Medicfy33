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

// Capa 2 (v2.5) — bandeja de curaduría de lab_reference_ranges.
// M10-RN-009: pendiente ≠ inválido, pero solo CURATOR/SUPERADMIN
// puede aprobar (mismo criterio ya probado para catálogos).
describe("Capa 2 — curaduría de rangos de referencia de laboratorio", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let curatorToken = "";
  let doctorToken = "";

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

    const curator = await prisma.user.create({
      data: { email: `curator.labs.${randomUUID()}@example.com`, passwordHash: "x", primaryRole: "CURATOR", status: "ACTIVE" },
    });
    curatorToken = tokenService.signAccessToken({ sub: curator.id, primaryRole: "CURATOR" });

    const doctor = await prisma.user.create({
      data: { email: `doctor.labs.${randomUUID()}@example.com`, passwordHash: "x", primaryRole: "DOCTOR", status: "ACTIVE" },
    });
    doctorToken = tokenService.signAccessToken({ sub: doctor.id, primaryRole: "DOCTOR" });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedRange() {
    return prisma.labReferenceRange.create({
      data: {
        analyteKey: `prueba-${randomUUID()}`,
        analyteLabel: "Analito de prueba",
        unit: "mg/dL",
        sex: "ANY",
        ageMinYears: 18,
        ageMaxYears: 120,
        valueMin: 10,
        valueMax: 20,
        pendingMedicalReview: true,
        source: "Fuente de prueba",
      },
    });
  }

  it("un CURATOR ve la bandeja de pendientes y aprueba una fila — curatedBy queda del actor, nunca del cuerpo", async () => {
    const range = await seedRange();

    const pending = await request(app.getHttpServer())
      .get("/lab-reference-ranges?pendingOnly=true")
      .set("Authorization", `Bearer ${curatorToken}`);
    expect(pending.status).toBe(200);
    expect(pending.body.some((r: { id: string }) => r.id === range.id)).toBe(true);

    const approved = await request(app.getHttpServer())
      .post(`/lab-reference-ranges/${range.id}/approve`)
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({});
    expect(approved.status).toBe(201);
    expect(approved.body.pendingMedicalReview).toBe(false);

    const stored = await prisma.labReferenceRange.findUniqueOrThrow({ where: { id: range.id } });
    expect(stored.curatedBy).not.toBeNull();

    const auditRow = await prisma.auditLog.findFirst({
      where: { resourceType: "lab_reference_range", resourceId: range.id, action: "lab_reference_range.approve" },
    });
    expect(auditRow?.result).toBe("SUCCESS");
  });

  it("un DOCTOR (no curador) no puede listar la bandeja ni aprobar (403), y la fila sigue pendiente", async () => {
    const range = await seedRange();

    const blockedList = await request(app.getHttpServer())
      .get("/lab-reference-ranges")
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(blockedList.status).toBe(403);

    const blockedApprove = await request(app.getHttpServer())
      .post(`/lab-reference-ranges/${range.id}/approve`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({});
    expect(blockedApprove.status).toBe(403);

    const stored = await prisma.labReferenceRange.findUniqueOrThrow({ where: { id: range.id } });
    expect(stored.pendingMedicalReview).toBe(true);
    expect(stored.curatedBy).toBeNull();
  });
});
