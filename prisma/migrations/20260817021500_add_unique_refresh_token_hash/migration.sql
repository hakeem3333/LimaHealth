-- DropIndex
DROP INDEX "RefreshToken_tokenHash_idx";

-- AlterTable
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tokenHash_key" UNIQUE ("tokenHash");
