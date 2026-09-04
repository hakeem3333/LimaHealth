-- CreateTable
CREATE TABLE "public"."CounselorNote" (
    "id" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorNote_counselorId_studentId_idx" ON "public"."CounselorNote"("counselorId", "studentId");

-- AddForeignKey
ALTER TABLE "public"."CounselorNote" ADD CONSTRAINT "CounselorNote_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CounselorNote" ADD CONSTRAINT "CounselorNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
