-- Fase 4 (prompts 32-38) — el plan que el paciente se lleva.

-- Prompt 32/36: unidad de dosis, indicación y procedencia por línea.
ALTER TABLE "prescription_items" ADD COLUMN "doseUnit" TEXT;
ALTER TABLE "prescription_items" ADD COLUMN "indication" TEXT;
ALTER TABLE "prescription_items" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'NUEVA';
ALTER TABLE "prescription_items" ADD COLUMN "sourcePrescriptionId" TEXT;
ALTER TABLE "prescription_items" ADD COLUMN "sourceIssuedAt" TIMESTAMPTZ(3);

-- Prompt 34: la justificación clínica que libera el bloqueo por alergia.
ALTER TABLE "prescriptions" ADD COLUMN "allergyOverrideJustification" TEXT;

-- Prompt 33 (🔒 pendiente de licencia): corte de origen por fila.
ALTER TABLE "medications_catalog" ADD COLUMN "sourceVersion" TEXT;

-- Prompt 35: motor de interacciones (datos de producción con la base
-- licenciada; filas actuales = demostración marcada).
CREATE TABLE "medication_interactions" (
    "id" TEXT NOT NULL,
    "medicationAId" TEXT NOT NULL,
    "medicationBId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pendingMedicalReview" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "medication_interactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medication_interactions_medicationAId_medicationBId_key" ON "medication_interactions"("medicationAId", "medicationBId");
ALTER TABLE "medication_interactions" ADD CONSTRAINT "medication_interactions_medicationAId_fkey" FOREIGN KEY ("medicationAId") REFERENCES "medications_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medication_interactions" ADD CONSTRAINT "medication_interactions_medicationBId_fkey" FOREIGN KEY ("medicationBId") REFERENCES "medications_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
GRANT SELECT ON TABLE "medication_interactions" TO medicfy_app;

-- Prompt 37A: estudios en dos niveles + motivo de catálogo.
ALTER TABLE "lab_order_items" ADD COLUMN "studyTermId" TEXT;
ALTER TABLE "lab_order_items" ADD COLUMN "motiveTermId" TEXT;
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_studyTermId_fkey" FOREIGN KEY ("studyTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_motiveTermId_fkey" FOREIGN KEY ("motiveTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prompt 37B/C: indicaciones para el paciente + próxima cita sugerida.
ALTER TABLE "clinical_notes" ADD COLUMN "patientInstructions" TEXT;
ALTER TABLE "clinical_notes" ADD COLUMN "suggestedFollowUpDays" INTEGER;
