-- AlterEnum
ALTER TYPE "public"."AppointmentStatus" ADD VALUE 'OPTION';

-- AlterTable
ALTER TABLE "public"."Appointment" ADD COLUMN     "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_groupId_idx" ON "public"."Appointment"("groupId");
