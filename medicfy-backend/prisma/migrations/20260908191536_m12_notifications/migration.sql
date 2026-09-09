-- M12 (notificaciones) — esquema base: 3 enums, 2 tablas nuevas, y la
-- preferencia de canal del usuario. Escrita a mano porque el CLI de
-- Prisma (`migrate dev` / `generate`) no puede alcanzar
-- binaries.prisma.sh desde este entorno (403 Forbidden confirmado en
-- validate/generate) — el contenido sigue el mismo formato que
-- generaría `prisma migrate dev`, verificado a mano contra
-- schema.prisma línea por línea. PENDIENTE(jorge): correr
-- `prisma migrate dev` en un entorno con acceso a ese CDN para que
-- Prisma registre esta migración en su tabla de control
-- (_prisma_migrations) y confirme que coincide con el esquema.

CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "notification_template_code" AS ENUM (
    'APPOINTMENT_SCHEDULED',
    'APPOINTMENT_CONFIRMED',
    'APPOINTMENT_REMINDER_24H',
    'APPOINTMENT_REMINDER_2H',
    'APPOINTMENT_CANCELLED',
    'APPOINTMENT_RESCHEDULED',
    'PRESCRIPTION_AVAILABLE',
    'LAB_ORDER_AVAILABLE',
    'LAB_RESULT_AVAILABLE',
    'DOCTOR_VERIFICATION_APPROVED',
    'DOCTOR_VERIFICATION_REJECTED',
    'PASSWORD_RESET'
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "notificationChannelPreference" "notification_channel" NOT NULL DEFAULT 'EMAIL';

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateCode" "notification_template_code" NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'EMAIL',
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "templateData" JSONB NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_access_tokens_pkey" PRIMARY KEY ("id")
);

-- M12-RN-006: idempotencia por (user_id, template_code, related_entity_id).
CREATE UNIQUE INDEX "notifications_userId_templateCode_relatedEntityId_key" ON "notifications"("userId", "templateCode", "relatedEntityId");

CREATE UNIQUE INDEX "notification_access_tokens_tokenHash_key" ON "notification_access_tokens"("tokenHash");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_access_tokens" ADD CONSTRAINT "notification_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
