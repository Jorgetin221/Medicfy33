-- Fase 1 / hallazgo #18: el embarazo no existía en el repositorio.
CREATE TYPE "pregnancy_status" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "pregnancy_dating_method" AS ENUM ('FUM', 'ULTRASONIDO');

CREATE TABLE "patient_pregnancies" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "pregnancy_status" NOT NULL DEFAULT 'ACTIVE',
    "lmpDate" DATE,
    "eddDate" DATE NOT NULL,
    "eddMethod" "pregnancy_dating_method" NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_pregnancies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_pregnancies_patientId_status_idx" ON "patient_pregnancies"("patientId", "status");

-- Un solo embarazo ACTIVE por paciente — barrera de base de datos,
-- no de aplicación (mismo criterio que el índice único del catálogo).
CREATE UNIQUE INDEX "patient_pregnancies_one_active_per_patient"
    ON "patient_pregnancies"("patientId") WHERE "status" = 'ACTIVE';

ALTER TABLE "patient_pregnancies"
    ADD CONSTRAINT "patient_pregnancies_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabla clínica de estado: UPDATE sí (el estado vigente cambia),
-- DELETE jamás — la regla "nada se borra" a nivel de GRANT, igual que
-- patient_allergies y patient_history_items.
GRANT SELECT, INSERT, UPDATE ON TABLE "patient_pregnancies" TO medicfy_app;
