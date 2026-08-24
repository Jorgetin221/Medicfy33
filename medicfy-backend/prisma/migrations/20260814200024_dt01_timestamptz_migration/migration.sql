-- DT-01: migrate every DateTime column from TIMESTAMP (no zone) to
-- TIMESTAMPTZ, per CLAUDE.md §4 ("TIMESTAMPTZ en base de datos").
--
-- WHY THIS ISN'T A BARE `ALTER COLUMN ... TYPE TIMESTAMPTZ`
-- ------------------------------------------------------------------
-- This database's session/server TimeZone is `America/Mexico_City`
-- (confirmed via `SHOW timezone;` before writing this — it is NOT
-- UTC). Postgres's implicit cast from `timestamp` to `timestamptz`
-- (the one a bare `ALTER COLUMN ... TYPE TIMESTAMPTZ(3)`, with no
-- `USING`, silently applies) interprets the existing naive value
-- using the CURRENT SESSION TimeZone. Run bare, on this server, that
-- would have reinterpreted every already-correct UTC wall-clock value
-- as if it were America/Mexico_City wall-clock and shifted it by 6
-- hours on conversion — silently, with no error, for every row in
-- every table.
--
-- Verified empirically before writing this migration (not assumed):
-- inserted a row with a known instant (2026-01-15T18:30:00.000Z)
-- through Prisma into a naive TIMESTAMP column, then read the raw
-- stored value back with psql. The raw naive value was
-- `2026-01-15 18:30:00` — i.e. Prisma writes the UTC wall-clock
-- representation into naive columns, regardless of session TimeZone.
-- So every existing naive timestamp in this database already holds a
-- correct UTC instant; it is only the column's declared type that is
-- wrong. The correct, value-preserving conversion is therefore
-- `USING "col" AT TIME ZONE 'UTC'` on every column — explicit, not
-- left to the session default — which tags the existing UTC
-- wall-clock value as UTC instead of asking Postgres to guess.
--
-- consents and audit_log specifically (LFPDPPP / NOM-024 legal
-- records, append-only under GRANT — see below): this file changes
-- `occurredAt`/`createdAt`'s declared TYPE only. The value stored for
-- every existing row is unchanged bit-for-bit in what instant it
-- represents — this migration corrects an ambiguous label, it does
-- not alter or move any legal fact. That distinction is why this is
-- being done at all rather than left alone: an ambiguous hour on a
-- consent or audit record is the exact defect this migration removes.
--
-- WHY THE APPEND-ONLY GRANT ON consents/audit_log DOESN'T BLOCK THIS
-- ------------------------------------------------------------------
-- R1/M15-RN-001's GRANT restricts what the APPLICATION's own DB role
-- (medicfy_app) can do at the DML level: SELECT + INSERT only, no
-- UPDATE/DELETE, so the running app itself — and anyone using it,
-- including an admin — can never rewrite or remove a row. `ALTER
-- TABLE ... ALTER COLUMN ... TYPE` is DDL, not DML: it runs as the
-- schema owner (the DATABASE_URL / migrator connection Prisma Migrate
-- uses, never APP_DATABASE_URL/medicfy_app), the same role that
-- created these tables and issued their GRANTs in the first place.
-- medicfy_app has no DDL privilege on any table regardless — that was
-- never what the GRANT was restricting. A column's declared type is
-- schema, not data; GRANTs are per-table/per-privilege and are
-- entirely unaffected by a column type change — no REVOKE/GRANT
-- statements are needed or included in this file, and none of the
-- GRANTs issued in earlier migrations need to be reissued.
--
-- The version-controlled, reviewed nature of a migration file (run
-- once, by the platform operator, before this column carries any
-- production weight — zero production rows exist today) is what
-- makes this categorically different from the kind of silent
-- application-level mutation R1 exists to prevent.

-- AlterTable
ALTER TABLE "assistant_invitations"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "acceptedAt" TYPE TIMESTAMPTZ(3) USING "acceptedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable — audit_log (NOM-024, append-only under GRANT: SELECT +
-- INSERT only for medicfy_app; see header note above).
ALTER TABLE "audit_log"
  ALTER COLUMN "occurredAt" TYPE TIMESTAMPTZ(3) USING "occurredAt" AT TIME ZONE 'UTC';

-- AlterTable — clinical_notes (R1 append-only under GRANT).
ALTER TABLE "clinical_notes"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable — consents (LFPDPPP, append-only under GRANT: SELECT +
-- INSERT only for medicfy_app; see header note above).
ALTER TABLE "consents"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "doctor_documents"
  ALTER COLUMN "uploadedAt" TYPE TIMESTAMPTZ(3) USING "uploadedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "reviewedAt" TYPE TIMESTAMPTZ(3) USING "reviewedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "doctor_services"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "doctors"
  ALTER COLUMN "verifiedAt" TYPE TIMESTAMPTZ(3) USING "verifiedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "password_reset_tokens"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" TYPE TIMESTAMPTZ(3) USING "usedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "practice_locations"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "sessions"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastUsedAt" TYPE TIMESTAMPTZ(3) USING "lastUsedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" TYPE TIMESTAMPTZ(3) USING "revokedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "specialties"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "user_roles"
  ALTER COLUMN "grantedAt" TYPE TIMESTAMPTZ(3) USING "grantedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "users"
  ALTER COLUMN "emailVerifiedAt" TYPE TIMESTAMPTZ(3) USING "emailVerifiedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "phoneVerifiedAt" TYPE TIMESTAMPTZ(3) USING "phoneVerifiedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lockedUntil" TYPE TIMESTAMPTZ(3) USING "lockedUntil" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastLoginAt" TYPE TIMESTAMPTZ(3) USING "lastLoginAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "acceptedAt" TYPE TIMESTAMPTZ(3) USING "acceptedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "verification_codes"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "consumedAt" TYPE TIMESTAMPTZ(3) USING "consumedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
