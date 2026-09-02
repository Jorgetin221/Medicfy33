-- v2.5 — Módulo de lectura e interpretación de estudios de
-- laboratorio (4 capas). Capa 1: lab_sheet_extractions/candidates
-- (tabla de espera, nunca lab_result_analytes hasta revisión). Capa 2:
-- lab_reference_ranges (pendingMedicalReview=true por default, ver
-- migración de GRANT y seed.ts). Capa 3: note_lab_results (congelado
-- en sign(), mismo patrón que vital_sign_sets).

-- CreateEnum
CREATE TYPE "lab_result_analyte_source" AS ENUM ('MANUAL', 'OCR_REVIEWED');

-- CreateEnum
CREATE TYPE "lab_sheet_extraction_status" AS ENUM ('UPLOADING', 'EXTRACTING', 'REVIEW_PENDING', 'ACCEPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "lab_sheet_extraction_confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "lab_reference_range_sex" AS ENUM ('M', 'F', 'ANY');

-- CreateEnum
CREATE TYPE "lab_range_source" AS ENUM ('SHEET', 'SYSTEM', 'NONE');

-- CreateEnum
CREATE TYPE "lab_value_status" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "lab_result_analytes" ADD COLUMN "source" "lab_result_analyte_source" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "lab_sheet_extractions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "status" "lab_sheet_extraction_status" NOT NULL DEFAULT 'EXTRACTING',
    "labNameDetected" TEXT,
    "resultDateDetected" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "lab_sheet_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_sheet_extraction_candidates" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "analyteNameRaw" TEXT NOT NULL,
    "valueRaw" TEXT NOT NULL,
    "unitRaw" TEXT,
    "referenceMinPrinted" DECIMAL(10,3),
    "referenceMaxPrinted" DECIMAL(10,3),
    "confidence" "lab_sheet_extraction_confidence" NOT NULL,
    "doctorConfirmedAnalyteName" TEXT,
    "doctorConfirmedValue" DECIMAL(10,3),
    "doctorConfirmedUnit" TEXT,
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "included" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lab_sheet_extraction_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_reference_ranges" (
    "id" TEXT NOT NULL,
    "analyteKey" TEXT NOT NULL,
    "analyteLabel" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sex" "lab_reference_range_sex" NOT NULL,
    "ageMinYears" DECIMAL(5,2) NOT NULL,
    "ageMaxYears" DECIMAL(5,2) NOT NULL,
    "valueMin" DECIMAL(10,3) NOT NULL,
    "valueMax" DECIMAL(10,3) NOT NULL,
    "criticalMin" DECIMAL(10,3),
    "criticalMax" DECIMAL(10,3),
    "pendingMedicalReview" BOOLEAN NOT NULL DEFAULT true,
    "curatedBy" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_reference_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_lab_results" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "sourceAnalyteId" TEXT NOT NULL,
    "analyteName" TEXT NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "referenceMin" DECIMAL(10,3),
    "referenceMax" DECIMAL(10,3),
    "rangeSource" "lab_range_source" NOT NULL,
    "status" "lab_value_status" NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "labName" TEXT,
    "resultDate" DATE,
    "source" "lab_result_analyte_source" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_sheet_extractions_patientId_createdAt_idx" ON "lab_sheet_extractions"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "lab_sheet_extraction_candidates_extractionId_idx" ON "lab_sheet_extraction_candidates"("extractionId");

-- CreateIndex
CREATE INDEX "lab_reference_ranges_analyteKey_sex_ageMinYears_ageMaxYears_idx" ON "lab_reference_ranges"("analyteKey", "sex", "ageMinYears", "ageMaxYears");

-- CreateIndex
CREATE INDEX "note_lab_results_noteId_idx" ON "note_lab_results"("noteId");

-- AddForeignKey
ALTER TABLE "lab_sheet_extractions" ADD CONSTRAINT "lab_sheet_extractions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_sheet_extraction_candidates" ADD CONSTRAINT "lab_sheet_extraction_candidates_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "lab_sheet_extractions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_reference_ranges" ADD CONSTRAINT "lab_reference_ranges_curatedBy_fkey" FOREIGN KEY ("curatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lab_results" ADD CONSTRAINT "note_lab_results_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "clinical_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lab_results" ADD CONSTRAINT "note_lab_results_sourceAnalyteId_fkey" FOREIGN KEY ("sourceAnalyteId") REFERENCES "lab_result_analytes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
