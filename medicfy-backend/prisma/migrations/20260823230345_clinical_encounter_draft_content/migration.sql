-- AlterTable
ALTER TABLE "clinical_encounters" ADD COLUMN     "draftContent" JSONB NOT NULL DEFAULT '{}';
