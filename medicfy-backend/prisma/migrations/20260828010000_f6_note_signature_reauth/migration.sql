-- Fase 6 (prompts 43-44) — firma con reautenticación, snapshot del
-- médico al firmar, y cancelación de nota.

-- Prompt 43: snapshot de nombre/cédula al firmar (R6), nunca resuelto
-- por join después. clinical_encounters ya permite UPDATE (a
-- diferencia de clinical_notes) — no requiere tocar su GRANT.
ALTER TABLE "clinical_encounters" ADD COLUMN "signedByLegalNameSnapshot" TEXT;
ALTER TABLE "clinical_encounters" ADD COLUMN "signedByLicenseSnapshot" TEXT;

-- Prompt 44B: cancelación de nota — misma forma exacta que
-- prescription_cancellations/lab_order_cancellations (tabla separada,
-- append-only, su sola existencia ES el estado "cancelada").
CREATE TABLE "clinical_note_cancellations" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "reasonTermId" TEXT NOT NULL,
    "reasonFreeText" TEXT,
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_cancellations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinical_note_cancellations_noteId_key" ON "clinical_note_cancellations"("noteId");

ALTER TABLE "clinical_note_cancellations" ADD CONSTRAINT "clinical_note_cancellations_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "clinical_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_note_cancellations" ADD CONSTRAINT "clinical_note_cancellations_reasonTermId_fkey" FOREIGN KEY ("reasonTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON TABLE "clinical_note_cancellations" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "clinical_note_cancellations" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "clinical_note_cancellations" FROM medicfy_app;
