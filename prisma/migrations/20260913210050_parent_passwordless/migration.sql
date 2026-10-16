-- AlterTable: passwordHash is no longer required — passwordless accounts (PARENT) have none
ALTER TABLE "public"."User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Migrate existing parent accounts (previously created with a temp password) to passwordless
UPDATE "public"."User"
SET "passwordHash" = NULL
WHERE "roleId" = (SELECT "id" FROM "public"."Role" WHERE "name" = 'PARENT');

-- CreateTable
CREATE TABLE "public"."ParentLoginOtp" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLoginOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentLoginOtp_userId_key" ON "public"."ParentLoginOtp"("userId");

-- AddForeignKey
ALTER TABLE "public"."ParentLoginOtp" ADD CONSTRAINT "ParentLoginOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
