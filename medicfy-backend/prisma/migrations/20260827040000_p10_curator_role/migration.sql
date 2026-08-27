-- Prompt 10 / P4 §6.5: rol curador de catálogos clínicos.
-- ALTER TYPE ... ADD VALUE va en su propia migración: Postgres no
-- permite usar el valor nuevo en la misma transacción que lo crea.
ALTER TYPE "role_name" ADD VALUE IF NOT EXISTS 'CURATOR';
