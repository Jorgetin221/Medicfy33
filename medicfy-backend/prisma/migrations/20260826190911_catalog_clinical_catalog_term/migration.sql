-- Prompt 7 (medicfy-50-prompts.md), R2 "los catálogos son cerrados":
-- tabla base de catálogo clínico. Aditiva, no toca ninguna tabla
-- existente — infraestructura nueva y paralela a
-- specialties/icd10_codes/medication_catalog, sin migrar datos.

-- CreateEnum
CREATE TYPE "clinical_catalog_term_status" AS ENUM ('ACTIVE', 'OBSOLETE', 'MERGED');

-- CreateTable
CREATE TABLE "clinical_catalog_terms" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "preferredTerm" TEXT NOT NULL,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalCode" TEXT,
    "codingSystem" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "clinical_catalog_term_status" NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" TEXT,
    "curatedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_catalog_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_catalog_terms_domain_key_key" ON "clinical_catalog_terms"("domain", "key");

-- AddForeignKey
ALTER TABLE "clinical_catalog_terms" ADD CONSTRAINT "clinical_catalog_terms_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
