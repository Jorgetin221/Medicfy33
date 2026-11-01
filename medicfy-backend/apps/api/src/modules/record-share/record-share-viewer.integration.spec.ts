import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { TokenService } from "../identity/services/token.service";

/**
 * PR-EXP-05 — Visor de sólo lectura. Cubre el criterio de
 * terminación: IDOR, grant vencido (avance de reloj real vía
 * actualización directa de expiresAt — no hay forma de "avanzar el
 * reloj del proceso" en una prueba de integración HTTP real, así que
 * se crea el grant YA vencido, que es equivalente: el guard lo
 * evalúa en cada request, nunca al crearlo), grant revocado, recurso
 * fuera de alcance, y que SHARE_VIEWED se registra. Mismo patrón de
 * arranque que los demás *.integration.spec.ts de este track.
 */
const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}
function uniquePhone(): string {
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}
function uniqueCedula(): string {
  return Math.floor(10000000 + Math.random() * 89999999).toString();
}

describe("Expediente compartido — PR-EXP-05 (visor de sólo lectura)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  async function registerVerifiedDoctor(legalFirstName: string): Promise<{ userId: string; doctorId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName,
      legalLastName: "ExpCompartido",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    await prisma.doctor.update({ where: { userId }, data: { verificationStatus: "VERIFIED" } });
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, doctorId: doctor.id, accessToken };
  }

  async function createGrant(options: {
    requesterDoctorId: string;
    custodianDoctorId: string;
    status?: "ACTIVE" | "EXPIRED" | "REVOKED_BY_PATIENT" | "SUSPENDED_BY_ADMIN";
    expiresAt?: Date;
    scope?: ("SUMMARY" | "SIGNED_NOTES" | "RESULTS" | "PRESCRIPTIONS" | "STUDY_ORDERS")[];
  }) {
    const patient = await prisma.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: "María José",
        lastNamePaternal: "Peña",
        birthDate: new Date("1990-03-15"),
        sexAtBirth: "F",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
        source: "CREATED_BY_DOCTOR",
      },
    });
    const shareRequest = await prisma.recordShareRequest.create({
      data: {
        requesterDoctorId: options.requesterDoctorId,
        custodianDoctorId: options.custodianDoctorId,
        patientId: patient.id,
        reason: "Valoración por dolor torácico y antecedentes",
        requestedScope: options.scope ?? ["SUMMARY"],
        requestedDurationDays: 30,
        linkTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "APPROVED",
      },
    });
    const consent = await prisma.recordShareConsent.create({
      data: {
        requestId: shareRequest.id,
        decision: "APPROVED",
        approvedScope: options.scope ?? ["SUMMARY"],
        durationDays: 30,
        consentTextVersion: "draft-2026-10-31",
        consentTextSha256: "0".repeat(64),
        channel: "EMAIL",
        decidedAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    });
    const grant = await prisma.recordShareGrant.create({
      data: {
        consentId: consent.id,
        revokeTokenHash: randomUUID(),
        requesterDoctorId: options.requesterDoctorId,
        custodianDoctorId: options.custodianDoctorId,
        patientId: patient.id,
        scope: options.scope ?? ["SUMMARY"],
        startsAt: new Date(),
        expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: options.status ?? "ACTIVE",
      },
    });
    return { patient, grant };
  }

  it("un grant ACTIVE y vigente permite ver el resumen, y SHARE_VIEWED queda en audit_log", async () => {
    const requester = await registerVerifiedDoctor("Receptor");
    const custodian = await registerVerifiedDoctor("Custodio");
    const { grant, patient } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patientName).toContain(patient.firstName);
    expect(res.body.summary.allergies).toBeDefined();

    const viewedLog = await prisma.auditLog.findFirst({ where: { action: "SHARE_VIEWED", resourceId: grant.id } });
    expect(viewedLog).not.toBeNull();
    expect((viewedLog?.metadata as { sections?: string[] } | null)?.sections).toContain("SUMMARY");
  });

  it("IDOR: un médico que no es el solicitante de ese grant recibe 403", async () => {
    const requester = await registerVerifiedDoctor("Dueno");
    const custodian = await registerVerifiedDoctor("CustodioAjeno");
    const attacker = await registerVerifiedDoctor("Atacante");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${attacker.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RECORD_SHARE_ACCESS_DENIED");

    const deniedLog = await prisma.auditLog.findFirst({ where: { action: "SHARE_ACCESS_DENIED", resourceId: grant.id } });
    expect(deniedLog).not.toBeNull();
  });

  it("un grant vencido da 403 aunque su status siga ACTIVE en la fila (el guard revisa expiresAt en cada request)", async () => {
    const requester = await registerVerifiedDoctor("Vencido");
    const custodian = await registerVerifiedDoctor("CustodioVencido");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId, expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(403);

    const updated = await prisma.recordShareGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(updated.status).toBe("EXPIRED");
  });

  it("un grant revocado da 403", async () => {
    const requester = await registerVerifiedDoctor("Revocado");
    const custodian = await registerVerifiedDoctor("CustodioRevocado");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId, status: "REVOKED_BY_PATIENT" });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("un recurso fuera de alcance da 403 (RESULTS no otorgado)", async () => {
    const requester = await registerVerifiedDoctor("FueraAlcance");
    const custodian = await registerVerifiedDoctor("CustodioFueraAlcance");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId, scope: ["SUMMARY"] });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}/results`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RECORD_SHARE_SCOPE_NOT_GRANTED");
  });

  it("un recurso dentro del alcance otorgado sí responde 200", async () => {
    const requester = await registerVerifiedDoctor("DentroAlcance");
    const custodian = await registerVerifiedDoctor("CustodioDentroAlcance");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId, scope: ["SUMMARY", "RESULTS"] });

    const res = await request(app.getHttpServer()).get(`/record-share/grants/${grant.id}/results`).set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("'Mis grants' solo lista los del médico que consulta", async () => {
    const requester = await registerVerifiedDoctor("Bandeja");
    const otherRequester = await registerVerifiedDoctor("OtroBandeja");
    const custodian = await registerVerifiedDoctor("CustodioBandeja");
    await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId });
    await createGrant({ requesterDoctorId: otherRequester.doctorId, custodianDoctorId: custodian.doctorId });

    const res = await request(app.getHttpServer()).get("/record-share/grants/mine").set("Authorization", `Bearer ${requester.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("ningún método de escritura existe en este controlador (solo GET)", async () => {
    const requester = await registerVerifiedDoctor("SoloLectura");
    const custodian = await registerVerifiedDoctor("CustodioSoloLectura");
    const { grant } = await createGrant({ requesterDoctorId: requester.doctorId, custodianDoctorId: custodian.doctorId });

    const res = await request(app.getHttpServer()).post(`/record-share/grants/${grant.id}`).set("Authorization", `Bearer ${requester.accessToken}`).send({});
    expect(res.status).toBe(404); // Nest: ruta no declarada con ese verbo.
  });
});
