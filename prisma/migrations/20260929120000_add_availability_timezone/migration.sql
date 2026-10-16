-- AlterTable: weekly hours are wall-clock times in the counselor's own zone.
-- Existing rows default to UTC, which matches how they were evaluated before
-- (the server compared them in its own zone, UTC in the container).
ALTER TABLE "public"."CounselorAvailability" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
