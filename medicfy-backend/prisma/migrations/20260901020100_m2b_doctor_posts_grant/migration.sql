-- M2B (spec §7, v2.2): doctor_posts/doctor_post_media no son datos
-- clínicos (R1 no aplica) — a diferencia de treatment_protocols
-- arriba, sí llevan DELETE real (M2B-RN-003: el autor puede borrar,
-- no solo archivar).

REVOKE ALL ON TABLE "doctor_posts" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "doctor_posts" TO medicfy_app;
REVOKE ALL ON TABLE "doctor_post_media" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "doctor_post_media" TO medicfy_app;
