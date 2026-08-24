/*
  Warnings:

  - You are about to drop the column `primarySpecialty` on the `doctors` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "doctor_document_type" AS ENUM ('CEDULA_PROFESIONAL', 'CEDULA_ESPECIALIDAD', 'INE', 'CV', 'CERTIFICADO_CONSEJO', 'COMPROBANTE_DOMICILIO');

-- CreateEnum
CREATE TYPE "doctor_document_review_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "service_type" AS ENUM ('FIRST_VISIT', 'FOLLOW_UP', 'TELECONSULTATION', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "price_visibility" AS ENUM ('PRIVATE', 'SHARED_ON_BOOKING');

-- AlterTable
ALTER TABLE "doctors" DROP COLUMN "primarySpecialty",
ADD COLUMN     "acceptsNewPatients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsTeleconsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "biography" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "primarySpecialtyId" TEXT,
ADD COLUMN     "secondarySpecialtyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "specialtyLicense" TEXT,
ADD COLUMN     "subscriptionPlan" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "university" TEXT,
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "yearsExperience" INTEGER;

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "cieGroup" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresSpecialtyLicense" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_documents" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "docType" "doctor_document_type" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" "doctor_document_review_status" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "doctor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_locations" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressStreet" TEXT,
    "addressExt" TEXT,
    "addressInt" TEXT,
    "addressColonia" TEXT,
    "addressMunicipality" TEXT,
    "addressState" TEXT,
    "addressPostalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_services" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationId" TEXT,
    "serviceType" "service_type" NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceMxnCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "priceVisibility" "price_visibility" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "specialties_code_key" ON "specialties"("code");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_primarySpecialtyId_fkey" FOREIGN KEY ("primarySpecialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_documents" ADD CONSTRAINT "doctor_documents_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_locations" ADD CONSTRAINT "practice_locations_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "practice_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: the four specialties M8-RN-014 publishes schemas for in v1.0.
-- Reference/catalog data, not environment-specific fake records — safe
-- in every environment including production (unlike R7's synthetic
-- patient data).
INSERT INTO "specialties" ("id", "code", "nameEs", "requiresSpecialtyLicense") VALUES
  (gen_random_uuid(), 'GENERAL', 'Medicina General', false),
  (gen_random_uuid(), 'GINECOLOGIA_OBSTETRICIA', 'Ginecología y Obstetricia', true),
  (gen_random_uuid(), 'PEDIATRIA', 'Pediatría', true),
  (gen_random_uuid(), 'MEDICINA_INTERNA', 'Medicina Interna', true);

-- Permissions for medicfy_app (R1, M15-RN-001). None of these tables
-- are clinical records under R1, so full CRUD is appropriate — scoped
-- to exactly what the M2 endpoints need (spec §8.1).
REVOKE ALL ON TABLE "specialties" FROM PUBLIC;
GRANT SELECT ON TABLE "specialties" TO medicfy_app;

REVOKE ALL ON TABLE "doctor_documents" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "doctor_documents" TO medicfy_app;

REVOKE ALL ON TABLE "practice_locations" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "practice_locations" TO medicfy_app;

REVOKE ALL ON TABLE "doctor_services" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "doctor_services" TO medicfy_app;
