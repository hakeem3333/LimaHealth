/*
  Warnings:

  - You are about to drop the column `token` on the `EmailVerificationToken` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `AdminOtp` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tokenHash]` on the table `EmailVerificationToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tokenHash` to the `EmailVerificationToken` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."EmailVerificationToken_token_key";

-- AlterTable
ALTER TABLE "public"."EmailVerificationToken" DROP COLUMN "token",
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AdminOtp_userId_key" ON "public"."AdminOtp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "public"."EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_schoolId_idx" ON "public"."EmailVerificationToken"("schoolId");
