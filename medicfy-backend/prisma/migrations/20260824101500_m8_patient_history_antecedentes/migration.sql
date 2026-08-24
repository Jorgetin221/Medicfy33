-- CreateEnum
CREATE TYPE "patient_history_category" AS ENUM ('HEREDOFAMILIAR', 'PERSONAL_NO_PATOLOGICO', 'PERSONAL_PATOLOGICO');

-- CreateEnum
CREATE TYPE "patient_history_status" AS ENUM ('PRESENTE', 'NEGADO', 'DESCONOCIDO', 'NO_INVESTIGADO');

-- CreateTable
CREATE TABLE "patient_history_items" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "patient_history_category" NOT NULL,
    "subtype" TEXT NOT NULL,
    "familyRelationship" TEXT NOT NULL DEFAULT 'NONE',
    "familyRelationshipDetail" TEXT,
    "status" "patient_history_status" NOT NULL DEFAULT 'NO_INVESTIGADO',
    "structuredValue" JSONB,
    "freeText" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_history_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_history_item_changes" (
    "id" TEXT NOT NULL,
    "historyItemId" TEXT NOT NULL,
    "previousStatus" "patient_history_status",
    "previousStructuredValue" JSONB,
    "previousFreeText" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_history_item_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_history_items_patientId_category_subtype_familyRela_key" ON "patient_history_items"("patientId", "category", "subtype", "familyRelationship");

-- AddForeignKey
ALTER TABLE "patient_history_items" ADD CONSTRAINT "patient_history_items_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_history_item_changes" ADD CONSTRAINT "patient_history_item_changes_historyItemId_fkey" FOREIGN KEY ("historyItemId") REFERENCES "patient_history_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants: patient_history_items es CRUD normal, igual que
-- patient_allergies/patient_medications (M8-RN-012: "se captura una
-- vez y se arrastra", editable, no append-only — M8-RN-001 no la
-- nombra). patient_history_item_changes SÍ es append-only real: solo
-- SELECT/INSERT, mismo tratamiento que prescription_handwritten_deliveries.
REVOKE ALL ON TABLE "patient_history_items" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "patient_history_items" TO medicfy_app;

REVOKE ALL ON TABLE "patient_history_item_changes" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "patient_history_item_changes" TO medicfy_app;
