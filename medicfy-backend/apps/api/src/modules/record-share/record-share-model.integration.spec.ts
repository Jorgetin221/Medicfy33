import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mustGetEnv } from "../../config/must-get-env";

/**
 * PR-EXP-01 (Bloque 1 — expediente compartido autorizado por el
 * paciente). Prueba de modelo, sin servicio ni controlador todavía
 * (eso llega con PR-EXP-02 en adelante): confirma que las cuatro
 * tablas nuevas existen, que record_share_requests/challenges/grants
 * aceptan las transiciones de estado que van a necesitar (UPDATE), y
 * que NINGUNA de las cuatro admite DELETE para medicfy_app — más el
 * mandato explícito del prompt maestro de que record_share_consents
 * "nunca se edita" (tampoco UPDATE). Mismo patrón que
 * records/append-only.integration.spec.ts: conecta como medicfy_app
 * (el rol real de la API) y como dueño del esquema solo para
 * fixtures.
 */
describe("expediente compartido — modelo de datos (PR-EXP-01)", () => {
  const appDb = new PrismaClient({
    datasources: { db: { url: mustGetEnv("APP_DATABASE_URL") } },
  });
  const ownerDb = new PrismaClient({
    datasources: { db: { url: mustGetEnv("DATABASE_URL") } },
  });

  let requesterUserId = "";
  let requesterDoctorId = "";
  let custodianUserId = "";
  let custodianDoctorId = "";
  let patientId = "";
  let requestId = "";
  let challengeId = "";
  let consentId = "";
  let grantId = "";

  beforeAll(async () => {
    await appDb.$connect();
    await ownerDb.$connect();

    async function createDoctor(label: string) {
      const user = await ownerDb.user.create({
        data: {
          email: `${label}.exp01.${randomUUID()}@example.com`,
          passwordHash: "x",
          primaryRole: "DOCTOR",
          status: "ACTIVE",
        },
      });
      const doctor = await ownerDb.doctor.create({
        data: {
          userId: user.id,
          legalFirstName: label,
          legalLastName: "ExpedienteCompartido",
          professionalLicense: randomUUID().replace(/-/g, "").slice(0, 7),
          slug: `${label}-exp01-${randomUUID().slice(0, 8)}`,
          verificationStatus: "VERIFIED",
        },
      });
      return { userId: user.id, doctorId: doctor.id };
    }

    const requester = await createDoctor("requester");
    requesterUserId = requester.userId;
    requesterDoctorId = requester.doctorId;

    const custodian = await createDoctor("custodian");
    custodianUserId = custodian.userId;
    custodianDoctorId = custodian.doctorId;

    const patient = await ownerDb.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: "Paciente",
        lastNamePaternal: "ExpedienteCompartido",
        birthDate: new Date("1990-01-01"),
        sexAtBirth: "F",
        phoneE164: "+525500000000",
        email: `patient.exp01.${randomUUID()}@example.com`,
        source: "CREATED_BY_DOCTOR",
      },
    });
    patientId = patient.id;

    const request = await ownerDb.recordShareRequest.create({
      data: {
        requesterDoctorId,
        custodianDoctorId,
        patientId,
        reason: "Valoración por dolor torácico — prueba de modelo PR-EXP-01",
        requestedScope: ["SUMMARY"],
        requestedDurationDays: 30,
        linkTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    requestId = request.id;

    const challenge = await ownerDb.recordShareChallenge.create({
      data: {
        requestId,
        channel: "PHONE",
        // Q1 (00-DESCUBRIMIENTO.md): no hay "contacto del custodio" —
        // solo el canal del Patient único.
        destinationRef: "PATIENT_PHONE",
        codeHash: "0".repeat(64),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    challengeId = challenge.id;

    const consent = await ownerDb.recordShareConsent.create({
      data: {
        requestId,
        decision: "APPROVED",
        approvedScope: ["SUMMARY"],
        durationDays: 30,
        consentTextVersion: "draft-2026-10-31",
        consentTextSha256: "0".repeat(64),
        channel: "PHONE",
        decidedAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    });
    consentId = consent.id;

    const grant = await ownerDb.recordShareGrant.create({
      data: {
        consentId,
        revokeTokenHash: randomUUID(),
        requesterDoctorId,
        custodianDoctorId,
        patientId,
        scope: ["SUMMARY"],
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    grantId = grant.id;
  });

  afterAll(async () => {
    // Orden inverso de FKs — mismo motivo que append-only.integration.spec.ts.
    if (grantId) await ownerDb.recordShareGrant.delete({ where: { id: grantId } }).catch(() => {});
    if (consentId) await ownerDb.recordShareConsent.delete({ where: { id: consentId } }).catch(() => {});
    if (challengeId) await ownerDb.recordShareChallenge.delete({ where: { id: challengeId } }).catch(() => {});
    if (requestId) await ownerDb.recordShareRequest.delete({ where: { id: requestId } }).catch(() => {});
    if (patientId) await ownerDb.patient.delete({ where: { id: patientId } }).catch(() => {});
    if (requesterDoctorId) await ownerDb.doctor.delete({ where: { id: requesterDoctorId } }).catch(() => {});
    if (custodianDoctorId) await ownerDb.doctor.delete({ where: { id: custodianDoctorId } }).catch(() => {});
    if (requesterUserId) await ownerDb.user.delete({ where: { id: requesterUserId } }).catch(() => {});
    if (custodianUserId) await ownerDb.user.delete({ where: { id: custodianUserId } }).catch(() => {});
    await appDb.$disconnect();
    await ownerDb.$disconnect();
  });

  describe("record_share_requests — estado vigente (UPDATE sí, DELETE jamás)", () => {
    it("allows medicfy_app to transition status via UPDATE", async () => {
      await expect(
        appDb.$executeRaw`UPDATE record_share_requests SET status = 'CANCELLED_BY_REQUESTER' WHERE id = ${requestId}`
      ).resolves.toBeDefined();
      // Se regresa a PENDING_PATIENT para no romper los fixtures de
      // los describe() de abajo, que asumen la cadena completa.
      await ownerDb.recordShareRequest.update({ where: { id: requestId }, data: { status: "PENDING_PATIENT" } });
    });

    it("rejects DELETE on record_share_requests for medicfy_app", async () => {
      await expect(appDb.$executeRaw`DELETE FROM record_share_requests WHERE id = ${requestId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("record_share_challenges — estado vigente (UPDATE sí, DELETE jamás)", () => {
    it("allows medicfy_app to register an attempt via UPDATE", async () => {
      await expect(
        appDb.$executeRaw`UPDATE record_share_challenges SET attempts = attempts + 1 WHERE id = ${challengeId}`
      ).resolves.toBeDefined();
    });

    it("rejects DELETE on record_share_challenges for medicfy_app", async () => {
      await expect(appDb.$executeRaw`DELETE FROM record_share_challenges WHERE id = ${challengeId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("record_share_grants — estado vigente (UPDATE sí, DELETE jamás)", () => {
    it("allows medicfy_app to revoke via UPDATE", async () => {
      await expect(
        appDb.$executeRaw`UPDATE record_share_grants SET status = 'REVOKED_BY_PATIENT', "revokedAt" = now() WHERE id = ${grantId}`
      ).resolves.toBeDefined();
      // Se regresa a ACTIVE por la misma razón que arriba.
      await ownerDb.recordShareGrant.update({ where: { id: grantId }, data: { status: "ACTIVE", revokedAt: null } });
    });

    it("rejects DELETE on record_share_grants for medicfy_app", async () => {
      await expect(appDb.$executeRaw`DELETE FROM record_share_grants WHERE id = ${grantId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  // Mandato explícito del prompt maestro (PR-EXP-01 §3): "un
  // consentimiento nunca se edita" — mismo tratamiento que
  // clinical_notes/consents (M1): solo SELECT+INSERT para medicfy_app.
  describe("record_share_consents — evidencia append-only (ni UPDATE ni DELETE)", () => {
    it("rejects UPDATE on record_share_consents for medicfy_app", async () => {
      await expect(
        appDb.$executeRaw`UPDATE record_share_consents SET "consentTextVersion" = 'tampered' WHERE id = ${consentId}`
      ).rejects.toThrow(/permission denied/i);
    });

    it("rejects DELETE on record_share_consents for medicfy_app", async () => {
      await expect(appDb.$executeRaw`DELETE FROM record_share_consents WHERE id = ${consentId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("record_share_grants — un solo ACTIVE por tripleta solicitante-custodio-paciente", () => {
    it("rejects a second ACTIVE grant for the same requester-custodian-patient triple", async () => {
      // requestId es @unique en record_share_consents (un consentimiento
      // por solicitud) — para probar el índice parcial del GRANT hace
      // falta una SEGUNDA solicitud/consentimiento de la misma tripleta,
      // no reutilizar los del beforeAll.
      const secondRequest = await ownerDb.recordShareRequest.create({
        data: {
          requesterDoctorId,
          custodianDoctorId,
          patientId,
          reason: "Segunda solicitud de prueba — índice parcial PR-EXP-01",
          requestedScope: ["SUMMARY"],
          requestedDurationDays: 30,
          linkTokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });
      const duplicateConsent = await ownerDb.recordShareConsent.create({
        data: {
          requestId: secondRequest.id,
          decision: "APPROVED",
          approvedScope: ["SUMMARY"],
          durationDays: 30,
          consentTextVersion: "draft-2026-10-31",
          consentTextSha256: "1".repeat(64),
          channel: "PHONE",
          decidedAt: new Date(),
          ipAddress: "127.0.0.1",
          userAgent: "vitest",
        },
      });
      // Nunca llega a crearse de verdad vía la API (PR-EXP-02/03 lo
      // impedirán antes con una regla de negocio), pero el índice
      // parcial debe bloquearlo incluso si algo más arriba se equivoca
      // — es la barrera de base de datos, no de aplicación.
      await expect(
        ownerDb.recordShareGrant.create({
          data: {
            consentId: duplicateConsent.id,
            revokeTokenHash: randomUUID(),
            requesterDoctorId,
            custodianDoctorId,
            patientId,
            scope: ["SUMMARY"],
            startsAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
      ).rejects.toThrow(/unique constraint/i);
      await ownerDb.recordShareConsent.delete({ where: { id: duplicateConsent.id } }).catch(() => {});
      await ownerDb.recordShareRequest.delete({ where: { id: secondRequest.id } }).catch(() => {});
    });
  });
});
