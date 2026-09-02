-- CreateEnum
CREATE TYPE "assistant_pass" AS ENUM ('SUBJETIVO', 'OBJETIVO', 'ANALISIS', 'CIERRE');

-- CreateTable
CREATE TABLE "assistant_readings" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "pase" "assistant_pass" NOT NULL,
    "contextHashSha256" TEXT NOT NULL,
    "readingJson" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_readings_encounterId_createdAt_idx" ON "assistant_readings"("encounterId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_readings" ADD CONSTRAINT "assistant_readings_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fase 8 · Prompt 51 — append-only, mismo criterio que clinical_notes
-- (R1): una lectura es lo que el modelo le dijo al médico en un
-- momento dado; un pase nuevo es una fila nueva, nunca una reescritura
-- de la anterior.
REVOKE ALL ON TABLE "assistant_readings" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "assistant_readings" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "assistant_readings" FROM medicfy_app;
