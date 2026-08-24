/*
  Warnings:

  - You are about to drop the column `content` on the `clinical_notes` table. All the data in the column will be lost.
  - Added the required column `assessment` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chiefComplaint` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentIllness` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encounterId` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plan` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vitals` to the `clinical_notes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "encounter_type" AS ENUM ('FIRST_VISIT', 'FOLLOW_UP', 'TELECONSULTATION', 'URGENT');

-- CreateEnum
CREATE TYPE "encounter_status" AS ENUM ('DRAFT', 'SIGNED');

-- CreateEnum
CREATE TYPE "signature_method" AS ENUM ('INTERNAL_SYSTEM', 'ADVANCED_EFIRMA');

-- CreateEnum
CREATE TYPE "diagnosis_type" AS ENUM ('PRINCIPAL', 'SECONDARY');

-- CreateEnum
CREATE TYPE "diagnosis_certainty" AS ENUM ('SUSPECTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "clinical_attachment_category" AS ENUM ('LAB_RESULT', 'IMAGING', 'EXTERNAL_DOCUMENT', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "allergy_status" AS ENUM ('ACTIVE', 'INACTIVE', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "allergy_certainty" AS ENUM ('CONFIRMED', 'LIKELY', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "patient_medication_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "control_group" AS ENUM ('I', 'II', 'III', 'IV', 'V', 'VI');

-- CreateEnum
CREATE TYPE "specialty_field_section" AS ENUM ('ANTECEDENTES', 'INTERROGATORIO', 'EXPLORACION', 'ESCALAS', 'SEGUIMIENTO');

-- CreateEnum
CREATE TYPE "specialty_field_input_type" AS ENUM ('NUMBER', 'TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'BOOLEAN', 'DATE', 'COMPUTED');

-- CreateEnum
CREATE TYPE "prescription_type" AS ENUM ('ELECTRONIC', 'EXTERNAL_PHYSICAL');

-- CreateEnum
CREATE TYPE "lab_result_uploader_role" AS ENUM ('DOCTOR', 'PATIENT');

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "patientId" TEXT;

-- AlterTable
ALTER TABLE "clinical_notes" DROP COLUMN "content",
ADD COLUMN     "assessment" TEXT NOT NULL,
ADD COLUMN     "chiefComplaint" TEXT NOT NULL,
ADD COLUMN     "currentIllness" TEXT NOT NULL,
ADD COLUMN     "encounterId" TEXT NOT NULL,
ADD COLUMN     "isCorrectionOfNoteId" TEXT,
ADD COLUMN     "physicalExam" TEXT,
ADD COLUMN     "plan" TEXT NOT NULL,
ADD COLUMN     "prognosis" TEXT,
ADD COLUMN     "vitals" JSONB NOT NULL;

-- CreateTable
CREATE TABLE "clinical_encounters" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "encounterType" "encounter_type" NOT NULL,
    "status" "encounter_status" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "signedAt" TIMESTAMPTZ(3),
    "signedByUserId" TEXT,
    "signatureMethod" "signature_method",
    "contentHashSha256" TEXT,
    "previousHashSha256" TEXT,
    "abandonedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_diagnoses" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "diagnosisType" "diagnosis_type" NOT NULL,
    "certainty" "diagnosis_certainty" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_attachments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "clinical_attachment_category" NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "description" TEXT,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_allergies" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "allergyType" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT NOT NULL,
    "ageOfOnset" TEXT,
    "status" "allergy_status" NOT NULL DEFAULT 'ACTIVE',
    "certainty" "allergy_certainty" NOT NULL,
    "source" TEXT NOT NULL,
    "lastReviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_medications" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "brandName" TEXT,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startedAt" DATE,
    "suspendedAt" DATE,
    "reason" TEXT,
    "status" "patient_medication_status" NOT NULL DEFAULT 'ACTIVE',
    "prescriber" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd10_codes" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "icd10_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "medications_catalog" (
    "id" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "brandNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "presentations" JSONB NOT NULL,
    "atcCode" TEXT,
    "controlGroup" "control_group" NOT NULL,
    "isElectronicallyPrescribable" BOOLEAN NOT NULL DEFAULT true,
    "commonDoses" JSONB,
    "contraindications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medications_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialty_field_schemas" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT,
    "version" INTEGER NOT NULL,
    "section" "specialty_field_section" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputType" "specialty_field_input_type" NOT NULL,
    "unit" TEXT,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "computedFormula" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialty_field_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_specialty_data" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "specialtySchemaVersion" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_specialty_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "prescriptionType" "prescription_type" NOT NULL DEFAULT 'ELECTRONIC',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doctorNameSnapshot" TEXT NOT NULL,
    "doctorLicenseSnapshot" TEXT NOT NULL,
    "doctorSpecialtySnapshot" TEXT,
    "doctorInstitutionSnapshot" TEXT,
    "practiceAddressSnapshot" TEXT NOT NULL,
    "patientNameSnapshot" TEXT NOT NULL,
    "patientAgeSnapshot" INTEGER NOT NULL,
    "patientSexSnapshot" TEXT NOT NULL,
    "diagnosisSnapshot" TEXT NOT NULL,
    "generalInstructions" TEXT,
    "replacesPrescriptionId" TEXT,
    "signatureMethod" "signature_method" NOT NULL,
    "signatureTimestamp" TIMESTAMPTZ(3) NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "pdfFileKey" TEXT,
    "qrVerificationToken" TEXT NOT NULL,
    "deliveredVia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_cancellations" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "brandName" TEXT,
    "presentation" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "quantity" TEXT,
    "specialInstructions" TEXT,
    "medicationCatalogId" TEXT,
    "controlGroup" "control_group" NOT NULL,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicalIndication" TEXT NOT NULL,
    "fastingRequired" BOOLEAN NOT NULL DEFAULT false,
    "assignedLabId" TEXT,
    "pdfFileKey" TEXT,
    "qrVerificationToken" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "signatureMethod" "signature_method" NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_cancellations" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_items" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "studyName" TEXT NOT NULL,
    "loincCode" TEXT,
    "notes" TEXT,

    CONSTRAINT "lab_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT,
    "patientId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByRole" "lab_result_uploader_role" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "labName" TEXT,
    "resultDate" DATE,
    "reviewedByDoctorId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "doctorComment" TEXT,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_encounters_appointmentId_key" ON "clinical_encounters"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "encounter_specialty_data_encounterId_key" ON "encounter_specialty_data"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_folio_key" ON "prescriptions"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_replacesPrescriptionId_key" ON "prescriptions"("replacesPrescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_qrVerificationToken_key" ON "prescriptions"("qrVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_cancellations_prescriptionId_key" ON "prescription_cancellations"("prescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_folio_key" ON "lab_orders"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_qrVerificationToken_key" ON "lab_orders"("qrVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "lab_order_cancellations_labOrderId_key" ON "lab_order_cancellations"("labOrderId");

-- CreateIndex
CREATE INDEX "audit_log_patientId_idx" ON "audit_log"("patientId");

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_isCorrectionOfNoteId_fkey" FOREIGN KEY ("isCorrectionOfNoteId") REFERENCES "clinical_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_diagnoses" ADD CONSTRAINT "encounter_diagnoses_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialty_field_schemas" ADD CONSTRAINT "specialty_field_schemas_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_specialty_data" ADD CONSTRAINT "encounter_specialty_data_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_replacesPrescriptionId_fkey" FOREIGN KEY ("replacesPrescriptionId") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_cancellations" ADD CONSTRAINT "prescription_cancellations_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medicationCatalogId_fkey" FOREIGN KEY ("medicationCatalogId") REFERENCES "medications_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_cancellations" ADD CONSTRAINT "lab_order_cancellations_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- M9-RN-005/M10 §6.7: folios únicos y consecutivos vía secuencia de
-- Postgres dedicada (M9-CA-005: 1000 folios concurrentes, sin huecos
-- ni duplicados) — mismo patrón que patients_medicfy_id_seq (ver
-- 20260814211044_m5a_pacientes_citas). Aplicación formatea como
-- MDF-<año>-<consecutivo de 6 dígitos>.
CREATE SEQUENCE "prescriptions_folio_seq" START 1;
CREATE SEQUENCE "lab_orders_folio_seq" START 1;

GRANT USAGE ON SEQUENCE "prescriptions_folio_seq" TO medicfy_app;
GRANT USAGE ON SEQUENCE "lab_orders_folio_seq" TO medicfy_app;

-- Tablas clínicas normales (mutables mientras el encuentro/nota está
-- en DRAFT — clinical_encounters no está en la lista literal de R1;
-- lo que sí exige inmutabilidad es clinical_notes, ver abajo).
REVOKE ALL ON TABLE "clinical_encounters" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "clinical_encounters" TO medicfy_app;

REVOKE ALL ON TABLE "encounter_diagnoses" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "encounter_diagnoses" TO medicfy_app;

REVOKE ALL ON TABLE "clinical_attachments" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "clinical_attachments" TO medicfy_app;

REVOKE ALL ON TABLE "patient_allergies" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "patient_allergies" TO medicfy_app;

REVOKE ALL ON TABLE "patient_medications" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "patient_medications" TO medicfy_app;

REVOKE ALL ON TABLE "icd10_codes" FROM PUBLIC;
GRANT SELECT ON TABLE "icd10_codes" TO medicfy_app;

REVOKE ALL ON TABLE "medications_catalog" FROM PUBLIC;
GRANT SELECT ON TABLE "medications_catalog" TO medicfy_app;

REVOKE ALL ON TABLE "specialty_field_schemas" FROM PUBLIC;
GRANT SELECT ON TABLE "specialty_field_schemas" TO medicfy_app;

REVOKE ALL ON TABLE "encounter_specialty_data" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "encounter_specialty_data" TO medicfy_app;

REVOKE ALL ON TABLE "lab_order_items" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "lab_order_items" TO medicfy_app;

REVOKE ALL ON TABLE "lab_results" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "lab_results" TO medicfy_app;

-- R1/M8-RN-001: clinical_notes append-only, mismo tratamiento que ya
-- tenía como placeholder — ahora con las columnas NOM-004 reales.
REVOKE ALL ON TABLE "clinical_notes" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "clinical_notes" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "clinical_notes" FROM medicfy_app;

-- R1/M9-RN-006: prescriptions append-only real — ni siquiera para
-- cancelar se actualiza esta fila (ver PrescriptionCancellation).
REVOKE ALL ON TABLE "prescriptions" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "prescriptions" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "prescriptions" FROM medicfy_app;

REVOKE ALL ON TABLE "prescription_items" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "prescription_items" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "prescription_items" FROM medicfy_app;

REVOKE ALL ON TABLE "prescription_cancellations" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "prescription_cancellations" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "prescription_cancellations" FROM medicfy_app;

-- R1/M10 §6.7: lab_orders append-only real, mismo tratamiento.
REVOKE ALL ON TABLE "lab_orders" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "lab_orders" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "lab_orders" FROM medicfy_app;

REVOKE ALL ON TABLE "lab_order_cancellations" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "lab_order_cancellations" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "lab_order_cancellations" FROM medicfy_app;

-- R1/M15-RN-001: audit_log ya era append-only; patientId es solo una
-- columna nueva sobre la misma tabla, el GRANT existente ya la cubre
-- (no hay UPDATE concedido a medicfy_app sobre audit_log desde M1).
