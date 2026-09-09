-- M15-RN-002: audit_log_chain_state no es una tabla clínica ni de
-- auditoría en sí misma (no guarda contenido de eventos, solo el
-- hash acumulado y un contador) — por eso, a diferencia de audit_log,
-- SÍ necesita UPDATE real para que AuditService.log() pueda avanzar
-- el puntero de la cadena bajo el lock de la transacción.

REVOKE ALL ON TABLE "audit_log_chain_state" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "audit_log_chain_state" TO medicfy_app;
REVOKE DELETE, TRUNCATE ON TABLE "audit_log_chain_state" FROM medicfy_app;
