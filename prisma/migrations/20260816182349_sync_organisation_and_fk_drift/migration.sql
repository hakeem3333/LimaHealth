/*
  Warnings:

  - You are about to drop the column `website` on the `Organisation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_orgId_fkey";

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_orgId_fkey";

-- DropIndex
DROP INDEX "public"."AdminOtp_userId_idx";

-- DropIndex
DROP INDEX "public"."EmailVerificationToken_orgId_idx";

-- DropIndex
DROP INDEX "public"."Organisation_contact_email_key";

-- DropIndex
DROP INDEX "public"."Organisation_name_key";

-- DropIndex
DROP INDEX "public"."User_orgId_idx";

-- AlterTable
ALTER TABLE "public"."Organisation" DROP COLUMN "website";

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
