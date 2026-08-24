import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mustGetEnv } from "../../config/must-get-env";

/**
 * R1 (CLAUDE.md §2) / M15-RN-001: clinical_notes, prescriptions and
 * lab_orders are append-only enforced by PostgreSQL GRANTs, not only
 * by application code. Connects as medicfy_app — the same role the
 * running API uses — never as the schema owner, which is reserved
 * here for fixture setup/teardown only.
 */
describe("append-only enforcement — clinical_notes, prescriptions, lab_orders", () => {
  const appDb = new PrismaClient({
    datasources: { db: { url: mustGetEnv("APP_DATABASE_URL") } },
  });
  const ownerDb = new PrismaClient({
    datasources: { db: { url: mustGetEnv("DATABASE_URL") } },
  });

  let doctorUserId = "";
  let doctorId = "";
  let patientId = "";
  let encounterId = "";
  let noteId = "";
  let prescriptionId = "";
  let labOrderId = "";

  beforeAll(async () => {
    await appDb.$connect();
    await ownerDb.$connect();

    const doctorUser = await ownerDb.user.create({
      data: {
        email: `doctor.append-only.${randomUUID()}@example.com`,
        passwordHash: "x",
        primaryRole: "DOCTOR",
        status: "ACTIVE",
      },
    });
    doctorUserId = doctorUser.id;

    const doctor = await ownerDb.doctor.create({
      data: {
        userId: doctorUser.id,
        legalFirstName: "Ana",
        legalLastName: "García",
        professionalLicense: randomUUID().replace(/-/g, "").slice(0, 7),
      },
    });
    doctorId = doctor.id;

    const patient = await ownerDb.patient.create({
      data: {
        medicfyId: `MDF-${randomUUID().replace(/-/g, "").slice(0, 6)}`,
        firstName: "Paciente",
        lastNamePaternal: "De Prueba",
        birthDate: new Date("1990-01-01"),
        sexAtBirth: "F",
        phoneE164: "+525500000000",
        email: `patient.append-only.${randomUUID()}@example.com`,
        source: "CREATED_BY_DOCTOR",
      },
    });
    patientId = patient.id;

    const encounter = await ownerDb.clinicalEncounter.create({
      data: { patientId, doctorId, encounterType: "FIRST_VISIT" },
    });
    encounterId = encounter.id;
  });

  afterAll(async () => {
    if (noteId) await ownerDb.clinicalNote.delete({ where: { id: noteId } }).catch(() => {});
    if (prescriptionId) await ownerDb.prescription.delete({ where: { id: prescriptionId } }).catch(() => {});
    if (labOrderId) await ownerDb.labOrder.delete({ where: { id: labOrderId } }).catch(() => {});
    if (encounterId) await ownerDb.clinicalEncounter.delete({ where: { id: encounterId } }).catch(() => {});
    if (patientId) await ownerDb.patient.delete({ where: { id: patientId } }).catch(() => {});
    if (doctorId) await ownerDb.doctor.delete({ where: { id: doctorId } }).catch(() => {});
    if (doctorUserId) await ownerDb.user.delete({ where: { id: doctorUserId } }).catch(() => {});
    await appDb.$disconnect();
    await ownerDb.$disconnect();
  });

  describe("clinical_notes", () => {
    it("allows medicfy_app to INSERT a clinical note", async () => {
      const note = await appDb.clinicalNote.create({
        data: {
          encounterId,
          chiefComplaint: "Dolor de prueba — append-only proof",
          currentIllness: "Evolución de prueba",
          vitals: {},
          assessment: "Impresión de prueba",
          plan: "Plan de prueba",
        },
      });
      noteId = note.id;
      expect(note.id).toBeTruthy();
    });

    it("allows medicfy_app to SELECT clinical notes", async () => {
      const notes = await appDb.clinicalNote.findMany({ where: { id: noteId } });
      expect(notes).toHaveLength(1);
    });

    it("rejects UPDATE on clinical_notes for medicfy_app (R1)", async () => {
      await expect(
        appDb.$executeRaw`UPDATE clinical_notes SET plan = 'tampered' WHERE id = ${noteId}`
      ).rejects.toThrow(/permission denied/i);
    });

    it("rejects DELETE on clinical_notes for medicfy_app (R1)", async () => {
      await expect(appDb.$executeRaw`DELETE FROM clinical_notes WHERE id = ${noteId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("prescriptions", () => {
    it("allows medicfy_app to INSERT a prescription", async () => {
      const prescription = await appDb.prescription.create({
        data: {
          encounterId,
          patientId,
          doctorId,
          folio: `MDF-TEST-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          doctorNameSnapshot: "Dra. Ana García",
          doctorLicenseSnapshot: "1234567",
          practiceAddressSnapshot: "Consultorio de prueba",
          patientNameSnapshot: "Paciente De Prueba",
          patientAgeSnapshot: 34,
          patientSexSnapshot: "F",
          diagnosisSnapshot: "Diagnóstico de prueba",
          signatureMethod: "INTERNAL_SYSTEM",
          signatureTimestamp: new Date(),
          contentHashSha256: "0".repeat(64),
          qrVerificationToken: randomUUID(),
        },
      });
      prescriptionId = prescription.id;
      expect(prescription.id).toBeTruthy();
    });

    it("rejects UPDATE on prescriptions for medicfy_app (R1/M9-RN-006 — ni siquiera para cancelar)", async () => {
      await expect(
        appDb.$executeRaw`UPDATE prescriptions SET "generalInstructions" = 'tampered' WHERE id = ${prescriptionId}`
      ).rejects.toThrow(/permission denied/i);
    });

    it("rejects DELETE on prescriptions for medicfy_app (R1)", async () => {
      await expect(appDb.$executeRaw`DELETE FROM prescriptions WHERE id = ${prescriptionId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });

  describe("lab_orders", () => {
    it("allows medicfy_app to INSERT a lab order", async () => {
      const labOrder = await appDb.labOrder.create({
        data: {
          encounterId,
          patientId,
          doctorId,
          folio: `MDF-LAB-TEST-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          clinicalIndication: "Indicación de prueba",
          signatureMethod: "INTERNAL_SYSTEM",
          signedAt: new Date(),
          contentHashSha256: "0".repeat(64),
          qrVerificationToken: randomUUID(),
        },
      });
      labOrderId = labOrder.id;
      expect(labOrder.id).toBeTruthy();
    });

    it("rejects UPDATE on lab_orders for medicfy_app (R1)", async () => {
      await expect(
        appDb.$executeRaw`UPDATE lab_orders SET "clinicalIndication" = 'tampered' WHERE id = ${labOrderId}`
      ).rejects.toThrow(/permission denied/i);
    });

    it("rejects DELETE on lab_orders for medicfy_app (R1)", async () => {
      await expect(appDb.$executeRaw`DELETE FROM lab_orders WHERE id = ${labOrderId}`).rejects.toThrow(
        /permission denied/i
      );
    });
  });
});
