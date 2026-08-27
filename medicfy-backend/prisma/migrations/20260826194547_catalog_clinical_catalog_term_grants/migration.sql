-- La migración anterior (20260826190911) creó la tabla pero omitió
-- los permisos de medicfy_app — mismo patrón que cada tabla nueva en
-- este proyecto (ver p. ej. prescription_handwritten_deliveries).
-- Se detectó al correr las pruebas del Prompt 7 (42501: permission
-- denied), se corrige aquí en vez de editar la migración ya aplicada.
-- SELECT+INSERT+UPDATE, nunca DELETE — obsolete()/merge() cambian
-- status/mergedIntoId en su lugar (no es una tabla append-only en el
-- sentido de R1, pero un término tampoco se borra jamás).
REVOKE ALL ON TABLE "clinical_catalog_terms" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "clinical_catalog_terms" TO medicfy_app;
