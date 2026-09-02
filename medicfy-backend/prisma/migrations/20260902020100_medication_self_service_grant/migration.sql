-- medications_catalog nació SELECT-only para medicfy_app (R2:
-- "catálogos cerrados", migración 20260823224811). Autoservicio de
-- medicamentos (decisión explícita del usuario, 2026-09-02) exige
-- INSERT real desde la aplicación — el propio catálogo deja de ser
-- de solo-siembra. Sigue append-only a propósito: solo INSERT, nunca
-- UPDATE/DELETE, ni para las filas agregadas por autoservicio (evita
-- que un médico "corrija" el controlGroup de un medicamento ya usado
-- en una receta existente — eso sería alterar el registro detrás de
-- un documento ya emitido).
GRANT INSERT ON TABLE "medications_catalog" TO medicfy_app;
