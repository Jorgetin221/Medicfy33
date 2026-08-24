-- AlterEnum
ALTER TYPE "doctor_verification_status" ADD VALUE 'VERIFIED_SPECIALTY_UNCONFIRMED';

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "letterheadPhrase" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "professionalEmail" TEXT,
ADD COLUMN     "professionalPhone" TEXT,
ADD COLUMN     "signatureImageUrl" TEXT;
