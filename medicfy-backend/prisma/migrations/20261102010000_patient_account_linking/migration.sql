-- Vinculación entre pacientes creados por el médico y cuentas de
-- paciente: que nunca existan dos expedientes de la misma persona.
--
-- Solo agrega (tipos, tablas, índices, permisos). No toca ni una fila
-- existente: la normalización de teléfonos a E.164 es un script de
-- datos aparte (scripts/normalize-patient-phones.ts), que se corre a
-- mano y por defecto solo reporta.
--
-- patients.userId ya era opcional y único desde M5a (un Patient tiene
-- como máximo una cuenta y viceversa) — no cambia aquí.

-- CreateEnum
CREATE TYPE "patient_activation_link_status" AS ENUM ('PENDING', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "patient_link_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "patient_activation_links" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "patient_activation_link_status" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(3),
    "usedByUserId" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "patient_activation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_link_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "patient_link_request_status" NOT NULL DEFAULT 'PENDING',
    "claimedFirstName" TEXT NOT NULL,
    "claimedLastNamePaternal" TEXT NOT NULL,
    "claimedLastNameMaternal" TEXT,
    "claimedBirthDate" DATE NOT NULL,
    "claimedSexAtBirth" "sex_at_birth" NOT NULL,
    "claimedPhoneE164" TEXT NOT NULL,
    "claimedEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" TEXT,

    CONSTRAINT "patient_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_activation_links_tokenHash_key" ON "patient_activation_links"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_activation_links_patientId_status_idx" ON "patient_activation_links"("patientId", "status");

-- CreateIndex
CREATE INDEX "patient_link_requests_patientId_status_idx" ON "patient_link_requests"("patientId", "status");

-- CreateIndex
CREATE INDEX "patient_link_requests_userId_status_idx" ON "patient_link_requests"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_link_requests_userId_patientId_key" ON "patient_link_requests"("userId", "patientId");

-- CreateIndex
CREATE INDEX "patients_phoneE164_idx" ON "patients"("phoneE164");

-- AddForeignKey
ALTER TABLE "patient_activation_links" ADD CONSTRAINT "patient_activation_links_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_requests" ADD CONSTRAINT "patient_link_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_requests" ADD CONSTRAINT "patient_link_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos. Las dos tablas tienen transiciones de estado reales (un
-- enlace pasa de PENDING a USED/REVOKED/EXPIRED; una solicitud de
-- PENDING a APPROVED/REJECTED/CANCELLED), así que medicfy_app necesita
-- UPDATE — mismo tratamiento que record_share_requests. Nunca DELETE:
-- son evidencia de quién vinculó qué expediente con qué cuenta.
REVOKE ALL ON TABLE "patient_activation_links" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_activation_links" TO medicfy_app;

REVOKE ALL ON TABLE "patient_link_requests" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_link_requests" TO medicfy_app;
