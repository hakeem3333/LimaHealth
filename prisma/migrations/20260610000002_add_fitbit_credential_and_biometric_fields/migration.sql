-- CreateTable: FitbitCredential
CREATE TABLE IF NOT EXISTS "FitbitCredential" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "fitbitUserId" TEXT NOT NULL,
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "scope"        TEXT,
  "tokenType"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitbitCredential_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "FitbitCredential_userId_key"    UNIQUE ("userId"),
  CONSTRAINT "FitbitCredential_fitbitUserId_key" UNIQUE ("fitbitUserId"),
  CONSTRAINT "FitbitCredential_userId_fkey"   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add new columns to BiometricLog
ALTER TABLE "BiometricLog" ADD COLUMN IF NOT EXISTS "steps"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BiometricLog" ADD COLUMN IF NOT EXISTS "calories"   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BiometricLog" ADD COLUMN IF NOT EXISTS "sleepHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
