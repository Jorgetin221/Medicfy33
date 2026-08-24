-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_EMAIL', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('PATIENT', 'DOCTOR', 'ASSISTANT', 'LAB', 'SUPPORT', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('PRIVACY_NOTICE', 'SENSITIVE_DATA', 'TELEMEDICINE', 'DIGITAL_PRESCRIPTION_CHANNEL', 'MARKETING');

-- CreateEnum
CREATE TYPE "doctor_verification_status" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "verification_channel" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "assistant_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "audit_result" AS ENUM ('SUCCESS', 'DENIED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneE164" TEXT,
    "passwordHash" TEXT NOT NULL,
    "primaryRole" "role_name" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'PENDING_EMAIL',
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "mfaBackupCodesHashed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "loginsWithoutMfa" INTEGER NOT NULL DEFAULT 0,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "acceptedTermsVersion" TEXT,
    "acceptedPrivacyVersion" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "role_name" NOT NULL,
    "scopeId" TEXT,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" "consent_type" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalFirstName" TEXT NOT NULL,
    "legalLastName" TEXT NOT NULL,
    "professionalLicense" TEXT NOT NULL,
    "primarySpecialty" TEXT NOT NULL,
    "verificationStatus" "doctor_verification_status" NOT NULL DEFAULT 'SUBMITTED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_invitations" (
    "id" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "assistant_invitation_status" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "verification_channel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "justification" TEXT,
    "result" "audit_result" NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_role_scopeId_key" ON "user_roles"("userId", "role", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_userId_key" ON "doctors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_professionalLicense_key" ON "doctors"("professionalLicense");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_invitations_token_key" ON "assistant_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_invitations" ADD CONSTRAINT "assistant_invitations_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions for medicfy_app (R1, M15-RN-001). The role itself was
-- created by the Sprint 0 migration (20260813205117_init_clinical_notes_append_only).
GRANT USAGE ON SCHEMA public TO medicfy_app;

-- Regular tables: medicfy_app needs full CRUD because these represent
-- mutable account/session state (failed_login_attempts increments,
-- session revocation, doctor verification transitions, invitation
-- acceptance, one-time codes/tokens being consumed). None of these are
-- clinical records under R1.
REVOKE ALL ON TABLE "users" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "users" TO medicfy_app;

REVOKE ALL ON TABLE "user_roles" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_roles" TO medicfy_app;

REVOKE ALL ON TABLE "sessions" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "sessions" TO medicfy_app;

REVOKE ALL ON TABLE "doctors" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "doctors" TO medicfy_app;

REVOKE ALL ON TABLE "assistant_invitations" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "assistant_invitations" TO medicfy_app;

REVOKE ALL ON TABLE "verification_codes" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "verification_codes" TO medicfy_app;

REVOKE ALL ON TABLE "password_reset_tokens" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "password_reset_tokens" TO medicfy_app;

-- Append-only tables (R1, M1-RN-003/004, M15-RN-001): consents and
-- audit_log are never updated or deleted, by anyone, including the
-- superadmin. Enforced here, not only in application code.
REVOKE ALL ON TABLE "consents" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "consents" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "consents" FROM medicfy_app;

REVOKE ALL ON TABLE "audit_log" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "audit_log" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_log" FROM medicfy_app;
