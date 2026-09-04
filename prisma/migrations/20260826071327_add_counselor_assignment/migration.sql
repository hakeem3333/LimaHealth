-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "assignedCounselorId" TEXT;

-- CreateIndex
CREATE INDEX "User_assignedCounselorId_idx" ON "public"."User"("assignedCounselorId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_assignedCounselorId_fkey" FOREIGN KEY ("assignedCounselorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
