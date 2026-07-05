-- Add severity column to Alert table
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'HIGH';
