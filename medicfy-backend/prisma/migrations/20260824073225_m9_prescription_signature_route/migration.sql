-- CreateEnum
CREATE TYPE "prescription_signature_route" AS ENUM ('HANDWRITTEN_AFTER_PRINT', 'ELECTRONIC');

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "signatureRoute" "prescription_signature_route";

-- CreateTable
CREATE TABLE "prescription_handwritten_deliveries" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "confirmedByUserId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_handwritten_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prescription_handwritten_deliveries_prescriptionId_key" ON "prescription_handwritten_deliveries"("prescriptionId");

-- AddForeignKey
ALTER TABLE "prescription_handwritten_deliveries" ADD CONSTRAINT "prescription_handwritten_deliveries_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions for medicfy_app — mismo patrón que cada tabla nueva en
-- este proyecto. Solo INSERT+SELECT: la confirmación de "firmada y
-- entregada" es la existencia de la fila, nunca un UPDATE (R1 no la
-- nombra literalmente, pero el mismo principio de
-- PrescriptionCancellation aplica: una vez insertada, no se toca).
REVOKE ALL ON TABLE "prescription_handwritten_deliveries" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "prescription_handwritten_deliveries" TO medicfy_app;
