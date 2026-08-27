-- Prompt 28: descartar no borra — nuevo valor del enum, en su propia
-- migración (ADD VALUE no puede usarse en la misma transacción).
ALTER TYPE "diagnosis_certainty" ADD VALUE IF NOT EXISTS 'DESCARTADO';
