-- Fase 5 (prompt 41) — documentos con acceso controlado.

-- clinical_attachments ya existía (M8-RN-010) pero sin studyDate: la
-- fecha del estudio es distinta de la fecha de subida y el prompt 41
-- la pide explícitamente en el formulario de carga.
ALTER TABLE "clinical_attachments" ADD COLUMN "studyDate" TIMESTAMPTZ(3);
