-- AlterTable
ALTER TABLE "public"."RefreshToken" ADD COLUMN     "previousTokenHash" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RefreshToken_previousTokenHash_idx" ON "public"."RefreshToken"("previousTokenHash");
