-- R1 — NADA SE BORRA. Cierre del hallazgo #6 de la auditoría del
-- Bloque 0 (26 ago 2026).
--
-- QUÉ ESTABA MAL. La regla permanente R1 dice que no existe
-- eliminación física de datos clínicos: toda corrección genera un
-- registro nuevo que referencia al anterior. Ese principio ya estaba
-- bien implementado para `clinical_notes`, `consents` y `audit_log`
-- —el rol de la aplicación nunca recibió DELETE sobre ellas, así que
-- la garantía la da Postgres y no la disciplina del código—, pero las
-- tablas clínicas que llegaron después en M8/M9/M10 se otorgaron con
-- el GRANT completo por omisión:
--
--   encounter_diagnoses    SELECT, INSERT, UPDATE, DELETE
--   patient_allergies      SELECT, INSERT, UPDATE, DELETE
--   patient_medications    SELECT, INSERT, UPDATE, DELETE
--   lab_order_items        SELECT, INSERT, UPDATE, DELETE
--   patient_history_items  SELECT, INSERT, UPDATE, DELETE
--
-- Es decir: la base de datos permitía borrar un diagnóstico, una
-- alergia, un medicamento vigente, un estudio de una orden ya emitida
-- o un antecedente. Un error de código, una migración mal escrita o
-- una consulta de mantenimiento podían hacerlo sin dejar rastro.
--
-- POR QUÉ AHORA Y NO EN SU FASE. Es una migración de una página y hoy
-- no hay datos de pacientes reales. Después de que los haya, cerrar
-- esto exige revisar qué se borró antes de cerrarlo.
--
-- POR QUÉ SE CONSERVA UPDATE. Estas cinco tablas guardan el estado
-- VIGENTE, no la bitácora: descartar un diagnóstico cambia su tipo,
-- suspender un medicamento cambia su status, y un antecedente
-- longitudinal actualiza su valor mientras `patient_history_item_changes`
-- conserva el anterior con su fecha y su autor. Quitar UPDATE rompería
-- eso sin ganar nada: lo que R1 prohíbe es que la fila desaparezca.
--
-- POR QUÉ `note_templates` NO ENTRA. Es el atajo de redacción de un
-- médico, no el expediente de un paciente: borrar una plantilla propia
-- es legítimo y `DELETE /note-templates/:id` lo usa hoy
-- (records/note-templates.controller.ts:62). El problema real de las
-- plantillas —que "guardar campo actual como plantilla" puede
-- persistir el texto clínico del paciente en pantalla— es el hallazgo
-- #14 y se arregla en la captura, no quitándole el borrado.
--
-- VERIFICACIÓN. Ningún archivo del backend llama delete()/deleteMany()
-- sobre estos cinco modelos, así que este REVOKE no rompe ninguna ruta
-- existente. La prueba que lo fija está en
-- apps/api/src/modules/records/append-only.integration.spec.ts,
-- describe "tablas clínicas de M8/M9/M10 — DELETE revocado (R1)".

REVOKE DELETE ON TABLE "encounter_diagnoses" FROM medicfy_app;
REVOKE DELETE ON TABLE "patient_allergies" FROM medicfy_app;
REVOKE DELETE ON TABLE "patient_medications" FROM medicfy_app;
REVOKE DELETE ON TABLE "lab_order_items" FROM medicfy_app;
REVOKE DELETE ON TABLE "patient_history_items" FROM medicfy_app;
