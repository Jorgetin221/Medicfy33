-- CreateEnum
CREATE TYPE "patient_source" AS ENUM ('SELF_SIGNUP', 'CREATED_BY_DOCTOR');

-- CreateEnum
CREATE TYPE "sex_at_birth" AS ENUM ('F', 'M');

-- CreateEnum
CREATE TYPE "guardian_relation" AS ENUM ('MADRE', 'PADRE', 'TUTOR_LEGAL', 'OTRO');

-- CreateEnum
CREATE TYPE "care_relationship_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "care_relationship_origin" AS ENUM ('APPOINTMENT', 'PATIENT_GRANTED', 'CREATED_BY_DOCTOR');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "appointment_created_via" AS ENUM ('DOCTOR_PANEL', 'ASSISTANT', 'PATIENT_LINK', 'PUBLIC_DIRECTORY');

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "cancellationPolicy" JSONB;

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "medicfyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNamePaternal" TEXT NOT NULL,
    "lastNameMaternal" TEXT,
    "birthDate" DATE NOT NULL,
    "sexAtBirth" "sex_at_birth" NOT NULL,
    "genderIdentity" TEXT,
    "curp" TEXT,
    "bloodType" TEXT,
    "phoneE164" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addressStreet" TEXT,
    "addressExt" TEXT,
    "addressInt" TEXT,
    "addressColonia" TEXT,
    "addressMunicipality" TEXT,
    "addressState" TEXT,
    "addressPostalCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "createdByUserId" TEXT,
    "source" "patient_source" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_guardians" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianRelation" "guardian_relation" NOT NULL,
    "guardianCurp" TEXT,
    "guardianPhoneE164" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "guardianIdDocumentKey" TEXT NOT NULL,
    "consentGrantedAt" TIMESTAMPTZ(3) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_relationships" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" "care_relationship_status" NOT NULL DEFAULT 'ACTIVE',
    "origin" "care_relationship_origin" NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedBy" TEXT,

    CONSTRAINT "care_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationId" TEXT,
    "serviceId" TEXT NOT NULL,
    "modality" "appointment_modality" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "status" "appointment_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdByUserId" TEXT NOT NULL,
    "createdVia" "appointment_created_via" NOT NULL,
    "priceMxnCents" INTEGER NOT NULL,
    "paymentReference" TEXT,
    "paymentDeadlineAt" TIMESTAMPTZ(3),
    "videoRoomUrl" TEXT,
    "videoProviderRef" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByUserId" TEXT,
    "reminder24hSentAt" TIMESTAMPTZ(3),
    "reminder2hSentAt" TIMESTAMPTZ(3),
    "rescheduledFromId" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "cancellationPolicySnapshot" JSONB NOT NULL,
    "completedWithoutNoteReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "fromStatus" "appointment_status",
    "toStatus" "appointment_status" NOT NULL,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_userId_key" ON "patients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_medicfyId_key" ON "patients"("medicfyId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_rescheduledFromId_key" ON "appointments"("rescheduledFromId");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_guardians" ADD CONSTRAINT "patient_guardians_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "practice_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "doctor_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- §6.2: "medicfy_id VARCHAR UNIQUE — folio legible: MDF-000123". A
-- Postgres sequence, not app-level counting, so it stays correct
-- under concurrent patient creation. Application code formats it as
-- MDF-<6-digit zero-padded nextval>.
CREATE SEQUENCE "patients_medicfy_id_seq" START 1;

-- §6.4 "Nota técnica crítica": EXCLUDE USING gist is the only
-- reliable way to prevent double-booking under concurrency —
-- validating only in the application layer fails exactly when two
-- patients book the same slot in the same second (M4-CA-001).
-- Requires btree_gist for the plain-equality (doctorId) operator
-- class alongside the range operator class.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist (
  "doctorId" WITH =,
  tstzrange("startsAt", "endsAt") WITH &&
) WHERE ("status" NOT IN ('CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR'));

-- M15-RN-001 / CLAUDE.md R1: none of patients/patient_guardians/
-- care_relationships/appointments are append-only — doctors/
-- assistants and the state machine legitimately update them (address
-- changes, guardian revocation, care_relationship expiry,
-- appointment status transitions). appointment_status_history IS
-- append-only (M5-RN-001: "toda transición se registra... sin
-- excepciones" — the spec's own §6.4 comment already calls this
-- table "append-only"), so it gets the same SELECT+INSERT-only GRANT
-- already used for clinical_notes/consents/audit_log — applying the
-- mechanism to a table the spec calls append-only, not only to R1's
-- literal 4-table list (consents already set this precedent in M1).

GRANT USAGE ON SEQUENCE "patients_medicfy_id_seq" TO medicfy_app;

REVOKE ALL ON TABLE "patients" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "patients" TO medicfy_app;

REVOKE ALL ON TABLE "patient_guardians" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_guardians" TO medicfy_app;

REVOKE ALL ON TABLE "care_relationships" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "care_relationships" TO medicfy_app;

REVOKE ALL ON TABLE "appointments" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "appointments" TO medicfy_app;

REVOKE ALL ON TABLE "appointment_status_history" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "appointment_status_history" TO medicfy_app;
