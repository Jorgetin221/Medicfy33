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

  // Hallazgo #6 del Bloque 0 (26 ago 2026): estas cinco tablas
  // llegaron en M8/M9/M10 con el GRANT completo por omisión, así que
  // la base de datos permitía borrar un diagnóstico, una alergia, un
  // medicamento vigente, un estudio de una orden ya emitida o un
  // antecedente. La migración
  // 20260827030000_r1_revoke_delete_on_clinical_tables lo cierra.
  //
  // UPDATE sí se conserva a propósito: estas tablas guardan el estado
  // VIGENTE, no la bitácora — descartar un diagnóstico cambia su tipo,
  // suspender un medicamento cambia su status, y un antecedente
  // longitudinal actualiza su valor mientras patient_history_item_changes
  // conserva el anterior. Lo que R1 prohíbe es que la fila desaparezca.
  describe("tablas clínicas de M8/M9/M10 — DELETE revocado (R1)", () => {
    it.each([
      "encounter_diagnoses",
      "patient_allergies",
      "patient_medications",
      "lab_order_items",
      "patient_history_items",
    ])("rechaza DELETE sobre %s para medicfy_app", async (tabla) => {
      // Sin fila real a propósito: el permiso se evalúa antes que el
      // WHERE, así que un id inexistente prueba el GRANT sin ensuciar
      // la base de datos de dev.
      await expect(appDb.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE id = 'no-existe'`)).rejects.toThrow(
        /permission denied/i
      );
    });

    it("conserva UPDATE — el estado vigente sí cambia, la fila no desaparece", async () => {
      await expect(
        appDb.$executeRawUnsafe(`UPDATE "patient_allergies" SET "severity" = 'LEVE' WHERE id = 'no-existe'`)
      ).resolves.toBe(0);
    });

    // No entra en el REVOKE: es el atajo de redacción de un médico, no
    // el expediente de un paciente, y DELETE /note-templates/:id lo usa.
    it("note_templates conserva DELETE", async () => {
      await expect(appDb.$executeRawUnsafe(`DELETE FROM "note_templates" WHERE id = 'no-existe'`)).resolves.toBe(0);
    });
  });
});
