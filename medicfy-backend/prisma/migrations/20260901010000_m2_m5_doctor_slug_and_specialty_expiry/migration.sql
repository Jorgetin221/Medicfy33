-- M2-RN-006 (vencimiento de cédula de especialidad) + M5-RN-007
-- (enlace público del médico /dr/{slug}).

ALTER TABLE "doctors" ADD COLUMN "specialtyLicenseExpiresAt" TIMESTAMPTZ(3);
ALTER TABLE "doctors" ADD COLUMN "slug" TEXT;

-- Backfill para las filas ya existentes (todas sintéticas, dev/R7) —
-- no necesitan un slug legible, solo único; los registros nuevos usan
-- el generador con nombre normalizado (auth.service.ts). id ya es
-- único, así que esto no puede colisionar.
UPDATE "doctors" SET "slug" = 'medico-' || id WHERE "slug" IS NULL;

ALTER TABLE "doctors" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "doctors_slug_key" ON "doctors"("slug");
