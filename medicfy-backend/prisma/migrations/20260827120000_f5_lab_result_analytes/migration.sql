-- Fase 5 (prompt 42A) — resultados de laboratorio como analitos
-- estructurados, complementando LabResult (el archivo crudo).

CREATE TABLE "lab_result_analytes" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "labOrderId" TEXT,
    "analyteName" TEXT NOT NULL,
    "loincCode" TEXT,
    "value" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "referenceMin" DECIMAL(10,3),
    "referenceMax" DECIMAL(10,3),
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "enteredByUserId" TEXT NOT NULL,
    "reviewedByDoctorId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_result_analytes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lab_result_analytes_patientId_analyteName_idx" ON "lab_result_analytes"("patientId", "analyteName");

ALTER TABLE "lab_result_analytes" ADD CONSTRAINT "lab_result_analytes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_result_analytes" ADD CONSTRAINT "lab_result_analytes_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
