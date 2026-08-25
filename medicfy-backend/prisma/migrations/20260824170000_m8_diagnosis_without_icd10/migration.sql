-- AlterTable
ALTER TABLE "encounter_diagnoses" ADD COLUMN     "codeAbsentReason" TEXT,
ALTER COLUMN "icd10Code" DROP NOT NULL;
