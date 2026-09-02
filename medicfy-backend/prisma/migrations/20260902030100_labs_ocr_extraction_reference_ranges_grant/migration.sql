-- Toda tabla nueva necesita su GRANT explícito para medicfy_app (R1
-- se hace cumplir a nivel de permisos de PostgreSQL, no solo en
-- código de aplicación).

-- lab_sheet_extractions / lab_sheet_extraction_candidates: capturan
-- estado transitorio (EXTRACTING/REVIEW_PENDING/...) y las
-- correcciones del médico durante la revisión (doctorConfirmed*,
-- wasEdited, included) — necesitan UPDATE. Nunca DELETE: incluso una
-- hoja fallida o rechazada queda como registro, nunca desaparece.
GRANT SELECT, INSERT, UPDATE ON TABLE "lab_sheet_extractions" TO medicfy_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "lab_sheet_extraction_candidates" TO medicfy_app;

-- lab_reference_ranges: la única mutación en runtime es la
-- aprobación del curador (pendingMedicalReview -> false, curatedBy).
-- Para corregir un rango se agrega una fila nueva, nunca se reescribe
-- la existente con nuevos valores — mismo principio de no-alteración
-- del resto del proyecto.
GRANT SELECT, INSERT, UPDATE ON TABLE "lab_reference_ranges" TO medicfy_app;

-- note_lab_results: pertenece a una nota FIRMADA — es APPEND-ONLY
-- real, sin UPDATE ni DELETE, igual que vital_sign_sets/clinical_notes.
GRANT SELECT, INSERT ON TABLE "note_lab_results" TO medicfy_app;
