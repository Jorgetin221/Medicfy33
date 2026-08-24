-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- R1 / M15-RN-001: the application connects as medicfy_app, never as the
-- schema owner. Enforcement lives here, at the PostgreSQL permission
-- level — not only in application code. No password is set here; it is
-- provisioned per environment outside version control (CLAUDE.md: "Nada
-- de secretos en el repositorio").
DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'medicfy_app') THEN
    CREATE ROLE medicfy_app LOGIN;
  END IF;
END
$$;

DO
$$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO medicfy_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO medicfy_app;

-- Append-only: medicfy_app may create and read notes, never modify or
-- remove one. A correction is a new row referencing the original, not
-- an UPDATE — see spec §6.5 / M8-RN-001.
REVOKE ALL ON TABLE "clinical_notes" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "clinical_notes" TO medicfy_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "clinical_notes" FROM medicfy_app;
