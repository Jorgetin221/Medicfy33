-- Expediente compartido: el paciente CON CUENTA recibe la solicitud
-- dentro de su cuenta y decide con su sesión iniciada (sin código por
-- correo). Solo agrega; no toca ninguna fila existente.
--
-- record_share_consents sigue siendo append-only (sin UPDATE ni
-- DELETE para medicfy_app): esto cambia el ESQUEMA, no ningún
-- consentimiento ya guardado. Las filas existentes conservan su
-- channel = 'EMAIL' y method = 'OTP'.

-- Postgres 16 admite ADD VALUE dentro de una transacción; el valor
-- nuevo no se usa en esta misma migración.
ALTER TYPE "record_share_consent_method" ADD VALUE 'PATIENT_SESSION';

-- Con PATIENT_SESSION no hubo canal externo: channel queda nulo en vez
-- de guardar un "EMAIL" que no ocurrió.
ALTER TABLE "record_share_consents" ALTER COLUMN "channel" DROP NOT NULL;
