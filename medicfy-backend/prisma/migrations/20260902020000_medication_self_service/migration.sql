-- AlterTable
ALTER TABLE "medications_catalog" ADD COLUMN     "addedByDoctorId" TEXT;

-- AddForeignKey
ALTER TABLE "medications_catalog" ADD CONSTRAINT "medications_catalog_addedByDoctorId_fkey" FOREIGN KEY ("addedByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
