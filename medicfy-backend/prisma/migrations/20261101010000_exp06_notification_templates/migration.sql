-- PR-EXP-06 (expediente compartido) — avisos a médicos con cuenta,
-- vía NotificationsService (M12). Va en su propia migración porque
-- toca un enum EXISTENTE que no es de este track (ver
-- docs/expediente-compartido/06-notificaciones-revocacion-caducidad.md
-- decisión 4). Postgres 16 admite ADD VALUE dentro de una transacción;
-- los valores nuevos no se usan en esta misma migración.
ALTER TYPE "notification_template_code" ADD VALUE 'RECORD_SHARE_APPROVED';
ALTER TYPE "notification_template_code" ADD VALUE 'RECORD_SHARE_NOT_AUTHORIZED';
ALTER TYPE "notification_template_code" ADD VALUE 'RECORD_SHARE_REVOKED';
ALTER TYPE "notification_template_code" ADD VALUE 'RECORD_SHARE_EXPIRING';
ALTER TYPE "notification_template_code" ADD VALUE 'RECORD_SHARE_CUSTODIAN_NOTICE';
