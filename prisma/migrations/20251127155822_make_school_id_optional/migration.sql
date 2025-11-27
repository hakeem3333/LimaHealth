-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_schoolId_fkey";

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "schoolId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
