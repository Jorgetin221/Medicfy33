-- Fase 2 (prompts 18, 21, 22, 23) — historia clínica estructurada.

-- Prompt 18/23B: referencia a catálogo + marca de heredado.
ALTER TABLE "patient_history_items" ADD COLUMN "catalogTermId" TEXT;
ALTER TABLE "patient_history_items" ADD COLUMN "inheritedFromTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patient_history_items" ADD COLUMN "inheritedReviewedAt" TIMESTAMPTZ(3);
ALTER TABLE "patient_history_items" ADD CONSTRAINT "patient_history_items_catalogTermId_fkey" FOREIGN KEY ("catalogTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prompt 23A: alergias ancladas al catálogo.
ALTER TABLE "patient_allergies" ADD COLUMN "catalogTermId" TEXT;
ALTER TABLE "patient_allergies" ADD COLUMN "medicationCatalogId" TEXT;
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_catalogTermId_fkey" FOREIGN KEY ("catalogTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_medicationCatalogId_fkey" FOREIGN KEY ("medicationCatalogId") REFERENCES "medications_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prompt 21: toxicomanías con cuantificación e índices almacenados.
CREATE TYPE "substance_use_status" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'NEGADO');
CREATE TYPE "substance_use_unit" AS ENUM ('CIGARROS_POR_DIA', 'UNIDADES_POR_SEMANA', 'UNIDADES_POR_DIA', 'OTRA');

CREATE TABLE "patient_substance_uses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substanceTermId" TEXT NOT NULL,
    "status" "substance_use_status" NOT NULL,
    "quantity" DECIMAL(8,2),
    "unit" "substance_use_unit",
    "ageOfOnset" INTEGER,
    "suspendedAt" DATE,
    "comment" TEXT,
    "packYears" DECIMAL(8,2),
    "stdDrinksPerWeek" DECIMAL(8,2),
    "computeFormula" TEXT,
    "computeVersion" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "patient_substance_uses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_substance_uses_patientId_substanceTermId_key" ON "patient_substance_uses"("patientId", "substanceTermId");
ALTER TABLE "patient_substance_uses" ADD CONSTRAINT "patient_substance_uses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_substance_uses" ADD CONSTRAINT "patient_substance_uses_substanceTermId_fkey" FOREIGN KEY ("substanceTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "patient_substance_use_changes" (
    "id" TEXT NOT NULL,
    "substanceUseId" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_substance_use_changes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "patient_substance_use_changes" ADD CONSTRAINT "patient_substance_use_changes_substanceUseId_fkey" FOREIGN KEY ("substanceUseId") REFERENCES "patient_substance_uses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prompt 22: gineco-obstétricos condicionados por sexo.
CREATE TABLE "patient_gyneco_histories" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "manuallyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "menarcheAge" INTEGER,
    "cycleDurationDays" INTEGER,
    "cycleFrequencyDays" INTEGER,
    "cycleAmount" TEXT,
    "dysmenorrhea" BOOLEAN,
    "otherDischarge" TEXT,
    "sexualOnsetAge" INTEGER,
    "sexualPartners" INTEGER,
    "contraceptiveMethod" TEXT,
    "sexualFrequency" TEXT,
    "stiHistory" TEXT,
    "gestas" INTEGER,
    "partos" INTEGER,
    "cesareas" INTEGER,
    "abortos" INTEGER,
    "perinatalHistory" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "patient_gyneco_histories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_gyneco_histories_patientId_key" ON "patient_gyneco_histories"("patientId");
ALTER TABLE "patient_gyneco_histories" ADD CONSTRAINT "patient_gyneco_histories_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "patient_gyneco_history_changes" (
    "id" TEXT NOT NULL,
    "gynecoHistoryId" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_gyneco_history_changes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "patient_gyneco_history_changes" ADD CONSTRAINT "patient_gyneco_history_changes_gynecoHistoryId_fkey" FOREIGN KEY ("gynecoHistoryId") REFERENCES "patient_gyneco_histories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prompt 23B: plantillas de antecedentes.
CREATE TABLE "antecedentes_templates" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "specialtyId" TEXT,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "antecedentes_templates_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "antecedentes_templates" ADD CONSTRAINT "antecedentes_templates_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "antecedentes_templates" ADD CONSTRAINT "antecedentes_templates_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- R1: tablas clínicas de estado — UPDATE sí, DELETE jamás. Las tablas
-- de cambios además son append-only (sin UPDATE).
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_substance_uses" TO medicfy_app;
GRANT SELECT, INSERT ON TABLE "patient_substance_use_changes" TO medicfy_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_gyneco_histories" TO medicfy_app;
GRANT SELECT, INSERT ON TABLE "patient_gyneco_history_changes" TO medicfy_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "antecedentes_templates" TO medicfy_app;
