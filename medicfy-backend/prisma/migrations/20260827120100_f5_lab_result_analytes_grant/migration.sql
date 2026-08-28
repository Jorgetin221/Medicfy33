-- Corrige un olvido de la migración anterior: toda tabla nueva
-- necesita su GRANT explícito para medicfy_app (R1 se hace cumplir a
-- nivel de permisos de PostgreSQL) — mismo set que lab_results
-- (SELECT, INSERT, UPDATE: soporta capturar y marcar como revisado,
-- sin DELETE).
GRANT SELECT, INSERT, UPDATE ON TABLE "lab_result_analytes" TO medicfy_app;
