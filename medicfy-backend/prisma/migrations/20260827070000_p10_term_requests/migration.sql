-- Prompt 9/10: bandeja de solicitudes de término + marca de validación
-- médica pendiente en el catálogo.
ALTER TABLE "clinical_catalog_terms" ADD COLUMN "pendingMedicalReview" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "catalog_term_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

CREATE TABLE "catalog_term_requests" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "proposedTerm" TEXT NOT NULL,
    "justification" TEXT,
    "status" "catalog_term_request_status" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resultingTermId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    CONSTRAINT "catalog_term_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalog_term_requests_status_domain_idx" ON "catalog_term_requests"("status", "domain");
ALTER TABLE "catalog_term_requests" ADD CONSTRAINT "catalog_term_requests_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_term_requests" ADD CONSTRAINT "catalog_term_requests_resultingTermId_fkey" FOREIGN KEY ("resultingTermId") REFERENCES "clinical_catalog_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una solicitud tampoco se borra: se resuelve.
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog_term_requests" TO medicfy_app;
