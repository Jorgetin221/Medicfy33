-- Expediente compartido: doble autorización. El acceso se crea solo
-- cuando el paciente Y su médico tratante (custodio) aprueban, en
-- cualquier orden; si cualquiera de los dos rechaza, la solicitud queda
-- DENIED. Decisión del usuario, 2026-11-02.
--
-- Solo agrega. Las solicitudes que sigan pendientes al aplicar esta
-- migración quedan con custodianDecision = 'PENDING': también
-- necesitarán la aprobación del médico. Las ya aprobadas no cambian
-- (su acceso ya existe).

CREATE TYPE "record_share_custodian_decision" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- Postgres 16 admite ADD VALUE dentro de una transacción; el valor
-- nuevo no se usa en esta misma migración.
ALTER TYPE "record_share_request_status" ADD VALUE 'PENDING_CUSTODIAN';

ALTER TABLE "record_share_requests"
  ADD COLUMN "custodianDecision" "record_share_custodian_decision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "custodianDecidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "custodianDecidedByUserId" TEXT;
