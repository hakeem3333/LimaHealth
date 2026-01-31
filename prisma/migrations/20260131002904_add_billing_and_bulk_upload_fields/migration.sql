/*
  Warnings:

  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."SchoolStatus" ADD VALUE 'PAYMENT_REQUIRED';
ALTER TYPE "public"."SchoolStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "public"."BulkUploadLog" ADD COLUMN     "errorData" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "public"."Subscription"("stripeSubscriptionId");
