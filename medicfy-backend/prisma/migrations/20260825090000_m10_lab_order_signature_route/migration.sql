-- CreateEnum
CREATE TYPE "lab_order_signature_route" AS ENUM ('HANDWRITTEN_AFTER_PRINT', 'ELECTRONIC');

-- AlterTable
ALTER TABLE "lab_orders" ADD COLUMN     "doctorInstitutionSnapshot" TEXT,
ADD COLUMN     "doctorLicenseSnapshot" TEXT,
ADD COLUMN     "doctorNameSnapshot" TEXT,
ADD COLUMN     "doctorSpecialtySnapshot" TEXT,
ADD COLUMN     "patientAgeSnapshot" INTEGER,
ADD COLUMN     "patientNameSnapshot" TEXT,
ADD COLUMN     "patientSexSnapshot" TEXT,
ADD COLUMN     "practiceAddressSnapshot" TEXT,
ADD COLUMN     "signatureRoute" "lab_order_signature_route",
ALTER COLUMN "signatureMethod" DROP NOT NULL,
ALTER COLUMN "signedAt" DROP NOT NULL;
