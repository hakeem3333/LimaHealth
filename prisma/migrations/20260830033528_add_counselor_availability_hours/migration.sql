-- CreateTable
CREATE TABLE "public"."CounselorAvailability" (
    "id" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorAvailability_counselorId_idx" ON "public"."CounselorAvailability"("counselorId");

-- AddForeignKey
ALTER TABLE "public"."CounselorAvailability" ADD CONSTRAINT "CounselorAvailability_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
