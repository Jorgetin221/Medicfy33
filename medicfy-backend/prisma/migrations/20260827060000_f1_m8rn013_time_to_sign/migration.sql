-- Fase 1 / M8-RN-013: el tiempo abrir->firmar es la métrica del
-- negocio — columna explícita fijada al firmar (servidor), consultable
-- sin recalcular sobre timestamps.
ALTER TABLE "clinical_encounters" ADD COLUMN "timeToSignSeconds" INTEGER;
