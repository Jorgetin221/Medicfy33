-- AlterTable
ALTER TABLE "vital_sign_sets" ADD COLUMN     "capillaryRefillSeconds" DECIMAL(3,1),
ADD COLUMN     "glucoseCapMgDl" INTEGER;

-- CreateTable
CREATE TABLE "red_flag_events" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "flagCode" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "triggerData" JSONB NOT NULL,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "red_flag_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "red_flag_events_encounterId_detectedAt_idx" ON "red_flag_events"("encounterId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "red_flag_events_encounterId_flagCode_key" ON "red_flag_events"("encounterId", "flagCode");

-- AddForeignKey
ALTER TABLE "red_flag_events" ADD CONSTRAINT "red_flag_events_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fase 8 · Prompt 52 — append-only, mismo criterio que
-- assistant_readings/clinical_notes (R1): una bandera roja es un
-- evento clínico que ocurrió en un momento dado, nunca se reescribe.
REVOKE ALL ON TABLE "red_flag_events" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "red_flag_events" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "red_flag_events" FROM medicfy_app;
