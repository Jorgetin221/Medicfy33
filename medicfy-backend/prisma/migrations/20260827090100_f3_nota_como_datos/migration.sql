-- Fase 3 (prompts 25-28, 30) — la nota como datos.

-- Prompt 25: tipo de nota del catálogo + especialidad (snapshot).
ALTER TABLE "clinical_notes" ADD COLUMN "noteTypeTermId" TEXT;
ALTER TABLE "clinical_notes" ADD COLUMN "specialtyCode" TEXT;
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_noteTypeTermId_fkey" FOREIGN KEY ("noteTypeTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prompt 28: FK real a icd10 + descarte que conserva histórico.
ALTER TABLE "encounter_diagnoses" ADD COLUMN "icd10CodeId" TEXT;
ALTER TABLE "encounter_diagnoses" ADD COLUMN "discardedAt" TIMESTAMPTZ(3);
ALTER TABLE "encounter_diagnoses" ADD COLUMN "discardedByUserId" TEXT;
ALTER TABLE "encounter_diagnoses" ADD CONSTRAINT "encounter_diagnoses_icd10CodeId_fkey" FOREIGN KEY ("icd10CodeId") REFERENCES "icd10_codes"("code") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill: anclar los códigos ya firmados que sí existen en el catálogo.
UPDATE "encounter_diagnoses" d SET "icd10CodeId" = c."code"
FROM "icd10_codes" c WHERE d."icd10Code" = c."code" AND d."icd10CodeId" IS NULL;

-- Prompt 26: signos vitales como entidad.
CREATE TABLE "vital_sign_sets" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bpSystolicMmHg" INTEGER,
    "bpDiastolicMmHg" INTEGER,
    "heartRateBpm" INTEGER,
    "respiratoryRateBpm" INTEGER,
    "temperatureC" DECIMAL(4,1),
    "spo2Percent" INTEGER,
    "weightKg" DECIMAL(6,2),
    "heightCm" DECIMAL(5,1),
    "headCircumferenceCm" DECIMAL(5,1),
    "abdominalCircumferenceCm" DECIMAL(5,1),
    "bmi" DECIMAL(4,1),
    "bmiFormula" TEXT,
    "bsaM2" DECIMAL(4,2),
    "bsaFormula" TEXT,
    "weightPercentile" DECIMAL(5,2),
    "heightPercentile" DECIMAL(5,2),
    "percentileSource" TEXT,
    "outOfRangeFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criticalFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vital_sign_sets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vital_sign_sets_noteId_key" ON "vital_sign_sets"("noteId");
CREATE INDEX "vital_sign_sets_patientId_recordedAt_idx" ON "vital_sign_sets"("patientId", "recordedAt");
ALTER TABLE "vital_sign_sets" ADD CONSTRAINT "vital_sign_sets_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "clinical_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vital_sign_sets" ADD CONSTRAINT "vital_sign_sets_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prompt 27/30: referencias LMS de crecimiento (OMS/CDC).
CREATE TABLE "growth_references" (
    "id" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "ageMonths" DECIMAL(6,2) NOT NULL,
    "l" DECIMAL(12,8) NOT NULL,
    "m" DECIMAL(12,6) NOT NULL,
    "s" DECIMAL(12,8) NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "growth_references_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "growth_references_sex_measure_ageMonths_source_key" ON "growth_references"("sex", "measure", "ageMonths", "source");

-- R1: la entidad de vitales pertenece a una nota FIRMADA — es
-- APPEND-ONLY real, sin UPDATE ni DELETE, igual que clinical_notes.
GRANT SELECT, INSERT ON TABLE "vital_sign_sets" TO medicfy_app;
-- Referencias de crecimiento: catálogo de solo lectura + siembra.
GRANT SELECT, INSERT ON TABLE "growth_references" TO medicfy_app;
