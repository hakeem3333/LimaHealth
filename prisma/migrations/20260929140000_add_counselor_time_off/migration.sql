-- CreateTable
CREATE TABLE "public"."CounselorTimeOff" (
    "id" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorTimeOff_counselorId_endDate_idx" ON "public"."CounselorTimeOff"("counselorId", "endDate");

-- AddForeignKey
ALTER TABLE "public"."CounselorTimeOff" ADD CONSTRAINT "CounselorTimeOff_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
