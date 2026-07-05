-- CreateTable: Appointment
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id"          TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "counselorId" TEXT NOT NULL,
  "startTime"   TIMESTAMP(3) NOT NULL,
  "endTime"     TIMESTAMP(3) NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "reason"      TEXT,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Appointment_studentId_fkey"   FOREIGN KEY ("studentId")   REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: AIAnalysis
CREATE TABLE IF NOT EXISTS "AIAnalysis" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "context"    TEXT NOT NULL,
  "inputJson"  JSONB NOT NULL,
  "outputJson" JSONB NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AIAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add isAvailable to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
