-- CreateEnum
CREATE TYPE "appointment_modality" AS ENUM ('IN_PERSON', 'ONLINE');

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "maxBookingWindowDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "minBookingNoticeMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "locationId" TEXT,
    "modality" "appointment_modality" NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "blocksAllDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "practice_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- M15-RN-001 / CLAUDE.md R1: neither table is clinical data, so both
-- get real CRUD for medicfy_app — not the append-only INSERT+SELECT
-- grant that clinical_notes/prescriptions/lab_orders/audit_log get.
--
-- availability_rules: full CRUD, matching §8.1's
-- GET/POST/PATCH/DELETE /doctors/me/availability-rules.
REVOKE ALL ON TABLE "availability_rules" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "availability_rules" TO medicfy_app;

-- availability_exceptions: no UPDATE — §8.1 only lists
-- GET/POST/DELETE /doctors/me/availability-exceptions, no PATCH.
REVOKE ALL ON TABLE "availability_exceptions" FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE "availability_exceptions" TO medicfy_app;
