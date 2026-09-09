-- M15-RN-002 (auditoría/cumplimiento): encadenamiento de hashes sobre
-- audit_log, mismo principio que el sello de integridad de las notas
-- firmadas (content-hash.util.ts / note-integrity.service.ts) pero
-- adaptado a que audit_log se escribe desde requests concurrentes
-- (no una nota, un médico, un encuentro a la vez): se agrega una
-- tabla puntero de una sola fila (audit_log_chain_state) para
-- serializar el avance de la cadena con SELECT ... FOR UPDATE — ver
-- AuditService.log(). Escrita a mano por el mismo motivo que
-- 20260908191536_m12_notifications: el CLI de Prisma no puede
-- alcanzar binaries.prisma.sh desde este entorno (403 confirmado).
-- PENDIENTE(jorge): correr `prisma migrate dev` en un entorno con
-- acceso a ese CDN para que Prisma registre esta migración en su
-- tabla de control (_prisma_migrations) y confirme que coincide con
-- schema.prisma.

-- AlterTable
ALTER TABLE "audit_log"
  ADD COLUMN "sequence" BIGINT,
  ADD COLUMN "hashSha256" TEXT,
  ADD COLUMN "previousHashSha256" TEXT;

CREATE UNIQUE INDEX "audit_log_sequence_key" ON "audit_log"("sequence");

-- CreateTable
CREATE TABLE "audit_log_chain_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "lastHashSha256" TEXT,

    CONSTRAINT "audit_log_chain_state_pkey" PRIMARY KEY ("id")
);

-- Fila única (id=1) que AuditService.log() bloquea y avanza dentro de
-- la misma transacción que cada inserción en audit_log.
INSERT INTO "audit_log_chain_state" ("id", "lastSequence", "lastHashSha256")
VALUES (1, 0, NULL)
ON CONFLICT ("id") DO NOTHING;
