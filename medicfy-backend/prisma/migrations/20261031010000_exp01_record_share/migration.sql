-- PR-EXP-01 (Bloque 1 — expediente compartido autorizado por el paciente).
-- Ver docs/expediente-compartido/00-DESCUBRIMIENTO.md (Q1, Q2) y
-- docs/planes/20261031-expediente-compartido-pr-exp-01.md.
--
-- No se reutiliza care_relationships: ese guard da paridad de
-- lectura+escritura con el médico tratante, sin alcance parcial — aquí
-- RE3/RE4 exigen solo lectura y "mínimo necesario" (scope). Sí se copia
-- su patrón de expiración perezosa (sin scheduler, revisada al momento
-- del acceso en PR-EXP-05).
--
-- R1 aplicado desde el día uno (no como corrección posterior, a
-- diferencia de R1/M8-M9-M10 que tuvo que revocarse después): ninguna
-- de estas 4 tablas recibe DELETE para medicfy_app.

-- Enums cerrados (R2).
CREATE TYPE "share_scope" AS ENUM ('SUMMARY', 'SIGNED_NOTES', 'RESULTS', 'PRESCRIPTIONS', 'STUDY_ORDERS');
CREATE TYPE "sensitive_category" AS ENUM ('MENTAL_HEALTH', 'HIV_STI', 'REPRODUCTIVE_HEALTH', 'SUBSTANCE_USE', 'GENETIC');
CREATE TYPE "record_share_request_status" AS ENUM ('PENDING_PATIENT', 'APPROVED', 'DENIED', 'EXPIRED_UNANSWERED', 'CANCELLED_BY_REQUESTER');
CREATE TYPE "record_share_consent_decision" AS ENUM ('APPROVED', 'DENIED');
CREATE TYPE "record_share_consent_method" AS ENUM ('OTP');
CREATE TYPE "record_share_challenge_purpose" AS ENUM ('AUTHORIZE', 'REVOKE');
CREATE TYPE "record_share_grant_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED_BY_PATIENT', 'SUSPENDED_BY_ADMIN');

-- CreateTable
CREATE TABLE "record_share_requests" (
    "id" TEXT NOT NULL,
    "requesterDoctorId" TEXT NOT NULL,
    "custodianDoctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedScope" "share_scope"[],
    "requestedDurationDays" INTEGER NOT NULL,
    "status" "record_share_request_status" NOT NULL DEFAULT 'PENDING_PATIENT',
    "linkTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "record_share_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_share_challenges" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "purpose" "record_share_challenge_purpose" NOT NULL DEFAULT 'AUTHORIZE',
    "channel" "verification_channel" NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resends" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_share_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_share_consents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "decision" "record_share_consent_decision" NOT NULL,
    "approvedScope" "share_scope"[],
    "includedSensitiveCategories" "sensitive_category"[] DEFAULT ARRAY[]::"sensitive_category"[],
    "pregnancyExcluded" BOOLEAN NOT NULL DEFAULT false,
    "durationDays" INTEGER NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentTextSha256" TEXT NOT NULL,
    "method" "record_share_consent_method" NOT NULL DEFAULT 'OTP',
    "channel" "verification_channel" NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "record_share_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_share_grants" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "requesterDoctorId" TEXT NOT NULL,
    "custodianDoctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scope" "share_scope"[],
    "excludedCategories" "sensitive_category"[] DEFAULT ARRAY[]::"sensitive_category"[],
    "pregnancyExcluded" BOOLEAN NOT NULL DEFAULT false,
    "revokeTokenHash" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "record_share_grant_status" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,

    CONSTRAINT "record_share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "record_share_requests_linkTokenHash_key" ON "record_share_requests"("linkTokenHash");
CREATE INDEX "record_share_requests_patientId_idx" ON "record_share_requests"("patientId");
CREATE INDEX "record_share_requests_requesterDoctorId_createdAt_idx" ON "record_share_requests"("requesterDoctorId", "createdAt");
CREATE INDEX "record_share_requests_custodianDoctorId_status_idx" ON "record_share_requests"("custodianDoctorId", "status");

-- CreateIndex
CREATE INDEX "record_share_challenges_requestId_idx" ON "record_share_challenges"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "record_share_consents_requestId_key" ON "record_share_consents"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "record_share_grants_consentId_key" ON "record_share_grants"("consentId");
CREATE UNIQUE INDEX "record_share_grants_revokeTokenHash_key" ON "record_share_grants"("revokeTokenHash");
CREATE INDEX "record_share_grants_requesterDoctorId_status_idx" ON "record_share_grants"("requesterDoctorId", "status");
CREATE INDEX "record_share_grants_patientId_status_idx" ON "record_share_grants"("patientId", "status");

-- Un solo grant ACTIVE por tripleta solicitante-custodio-paciente —
-- barrera de base de datos, no de aplicación (mismo criterio que
-- patient_pregnancies_one_active_per_patient). Prisma no expresa WHERE
-- en @@unique, así que este índice vive solo aquí, agregado a mano.
CREATE UNIQUE INDEX "record_share_grants_one_active_per_triple"
    ON "record_share_grants"("requesterDoctorId", "custodianDoctorId", "patientId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "record_share_requests" ADD CONSTRAINT "record_share_requests_requesterDoctorId_fkey" FOREIGN KEY ("requesterDoctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_share_requests" ADD CONSTRAINT "record_share_requests_custodianDoctorId_fkey" FOREIGN KEY ("custodianDoctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_share_requests" ADD CONSTRAINT "record_share_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_share_challenges" ADD CONSTRAINT "record_share_challenges_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "record_share_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_share_consents" ADD CONSTRAINT "record_share_consents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "record_share_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_share_grants" ADD CONSTRAINT "record_share_grants_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "record_share_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_share_grants" ADD CONSTRAINT "record_share_grants_requesterDoctorId_fkey" FOREIGN KEY ("requesterDoctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_share_grants" ADD CONSTRAINT "record_share_grants_custodianDoctorId_fkey" FOREIGN KEY ("custodianDoctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_share_grants" ADD CONSTRAINT "record_share_grants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos (R1 desde el día uno — ninguna de las cuatro recibe DELETE).
-- record_share_requests / record_share_challenges / record_share_grants:
-- SÍ necesitan UPDATE (transiciones de estado reales: una solicitud pasa
-- de PENDING_PATIENT a APPROVED/DENIED/EXPIRED/CANCELLED; un challenge
-- acumula attempts/resends y marca consumedAt/lockedUntil; un grant pasa
-- de ACTIVE a EXPIRED/REVOKED_BY_PATIENT/SUSPENDED_BY_ADMIN) — mismo
-- tratamiento que patient_pregnancies (estado vigente, no bitácora).
REVOKE ALL ON TABLE "record_share_requests" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "record_share_requests" TO medicfy_app;

REVOKE ALL ON TABLE "record_share_challenges" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "record_share_challenges" TO medicfy_app;

REVOKE ALL ON TABLE "record_share_grants" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "record_share_grants" TO medicfy_app;

-- record_share_consents: evidencia del consentimiento, igual que
-- consents (M1) y clinical_notes — append-only Y nunca editable.
-- Mandato explícito del prompt maestro: "un consentimiento nunca se
-- edita". Mismo patrón exacto que clinical_notes/prescriptions.
REVOKE ALL ON TABLE "record_share_consents" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "record_share_consents" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "record_share_consents" FROM medicfy_app;
