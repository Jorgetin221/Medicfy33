-- Auditoría 2026-10-21 · M-01, M-02, M-04 — endurecimiento de identidad.
-- Solo agrega columnas e índices.

-- M-01: anti-repetición de TOTP. Un código de 6 dígitos vale 30 s (±1
-- paso); sin esto, quien lo observara podía reusarlo en esa ventana.
-- Se guarda el último paso de tiempo aceptado; uno igual o anterior se
-- rechaza.
ALTER TABLE "users" ADD COLUMN "mfaLastTotpStep" INTEGER;

-- M-02: los códigos de verificación de correo/teléfono (6 dígitos) no
-- contaban intentos: 10^6 combinaciones se agotan por fuerza bruta.
ALTER TABLE "verification_codes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- M-04: detección de reúso de refresh token. Se conserva el hash
-- anterior a la última rotación: si alguien vuelve a presentar ese
-- token (robado), la sesión completa se revoca.
ALTER TABLE "sessions" ADD COLUMN "previousRefreshTokenHash" TEXT;
ALTER TABLE "sessions" ADD COLUMN "rotatedAt" TIMESTAMPTZ(3);
CREATE INDEX "sessions_previousRefreshTokenHash_idx" ON "sessions" ("previousRefreshTokenHash");
