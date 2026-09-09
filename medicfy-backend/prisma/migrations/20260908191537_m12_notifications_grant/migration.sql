-- M12 (notificaciones): notifications/notification_access_tokens no
-- son datos clínicos (R1 no aplica) pero sí necesitan UPDATE real —
-- notifications transiciona PENDING -> SENT|FAILED,
-- notification_access_tokens marca usedAt al consumir el enlace de un
-- solo uso (M12-RN-002). Mismo patrón que doctor_posts_grant: sin
-- DELETE porque nada en este módulo borra filas todavía.

REVOKE ALL ON TABLE "notifications" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "notifications" TO medicfy_app;
REVOKE ALL ON TABLE "notification_access_tokens" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "notification_access_tokens" TO medicfy_app;
