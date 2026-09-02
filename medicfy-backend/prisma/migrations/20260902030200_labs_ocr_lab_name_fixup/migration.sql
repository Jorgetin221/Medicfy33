-- Corrige la migración anterior de la misma tarea (v2.5, todavía sin
-- publicar): lab_result_analytes no tenía dónde guardar el
-- laboratorio de origen, así que note_lab_results.labName no tenía
-- fuente real de la que congelarse. Se agrega la columna que faltaba
-- y se quita resultDate de note_lab_results — era redundante con
-- measuredAt, que ya representa la fecha del estudio.

-- AlterTable
ALTER TABLE "lab_result_analytes" ADD COLUMN "labName" TEXT;

-- AlterTable
ALTER TABLE "note_lab_results" DROP COLUMN "resultDate";
