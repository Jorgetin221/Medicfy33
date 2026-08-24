-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "physicalRecipeFolio" TEXT,
ALTER COLUMN "signatureMethod" DROP NOT NULL,
ALTER COLUMN "signatureTimestamp" DROP NOT NULL,
ALTER COLUMN "contentHashSha256" DROP NOT NULL,
ALTER COLUMN "qrVerificationToken" DROP NOT NULL;
