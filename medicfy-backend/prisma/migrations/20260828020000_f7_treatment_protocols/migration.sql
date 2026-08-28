-- Fase 7 (prompt 47) — modelo genérico de protocolo longitudinal:
-- protocolo (definición, DATOS) → instancia por paciente → sesión.

CREATE TABLE "treatment_protocols" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialtyId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceCitation" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_protocols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "treatment_protocol_session_templates" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "windowStartOffsetDays" INTEGER NOT NULL,
    "windowEndOffsetDays" INTEGER NOT NULL,

    CONSTRAINT "treatment_protocol_session_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treatment_protocol_session_templates_protocolId_sequenceNumber_key" ON "treatment_protocol_session_templates"("protocolId", "sequenceNumber");

CREATE TABLE "protocol_field_schemas" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputType" "specialty_field_input_type" NOT NULL,
    "unit" TEXT,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,

    CONSTRAINT "protocol_field_schemas_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "patient_protocol_instance_status" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "protocol_instance_closure_reason" AS ENUM ('COMPLETADO', 'ABANDONADO', 'CAMBIO_PLAN', 'REFERIDO');

CREATE TABLE "patient_protocol_instances" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "protocolVersion" INTEGER NOT NULL,
    "status" "patient_protocol_instance_status" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByUserId" TEXT NOT NULL,
    "currentSessionNumber" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMPTZ(3),
    "closureReason" "protocol_instance_closure_reason",
    "closureNotes" TEXT,

    CONSTRAINT "patient_protocol_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_protocol_instances_patientId_status_idx" ON "patient_protocol_instances"("patientId", "status");

CREATE TABLE "protocol_sessions" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "proposedDate" DATE NOT NULL,
    "actualDate" DATE,
    "withinWindow" BOOLEAN,
    "encounterId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "protocol_sessions_instanceId_sequenceNumber_key" ON "protocol_sessions"("instanceId", "sequenceNumber");

ALTER TABLE "treatment_protocols" ADD CONSTRAINT "treatment_protocols_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_protocol_session_templates" ADD CONSTRAINT "treatment_protocol_session_templates_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "treatment_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protocol_field_schemas" ADD CONSTRAINT "protocol_field_schemas_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "treatment_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_protocol_instances" ADD CONSTRAINT "patient_protocol_instances_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_protocol_instances" ADD CONSTRAINT "patient_protocol_instances_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "treatment_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protocol_sessions" ADD CONSTRAINT "protocol_sessions_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "patient_protocol_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protocol_sessions" ADD CONSTRAINT "protocol_sessions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "treatment_protocol_session_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protocol_sessions" ADD CONSTRAINT "protocol_sessions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ninguna de estas 5 tablas está en la lista literal de R1 — mismo
-- patrón que clinical_encounters (SELECT+INSERT+UPDATE, sin DELETE):
-- estado vigente de una instancia/sesión, no bitácora inmutable.
REVOKE ALL ON TABLE "treatment_protocols" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "treatment_protocols" TO medicfy_app;
REVOKE ALL ON TABLE "treatment_protocol_session_templates" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "treatment_protocol_session_templates" TO medicfy_app;
REVOKE ALL ON TABLE "protocol_field_schemas" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "protocol_field_schemas" TO medicfy_app;
REVOKE ALL ON TABLE "patient_protocol_instances" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_protocol_instances" TO medicfy_app;
REVOKE ALL ON TABLE "protocol_sessions" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE "protocol_sessions" TO medicfy_app;
