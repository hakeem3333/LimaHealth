-- CreateTable
CREATE TABLE "public"."CounselorChangeRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentCounselorId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "newCounselorId" TEXT,
    "adminNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorChangeRequest_studentId_idx" ON "public"."CounselorChangeRequest"("studentId");

-- CreateIndex
CREATE INDEX "CounselorChangeRequest_status_idx" ON "public"."CounselorChangeRequest"("status");

-- AddForeignKey
ALTER TABLE "public"."CounselorChangeRequest" ADD CONSTRAINT "CounselorChangeRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CounselorChangeRequest" ADD CONSTRAINT "CounselorChangeRequest_currentCounselorId_fkey" FOREIGN KEY ("currentCounselorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CounselorChangeRequest" ADD CONSTRAINT "CounselorChangeRequest_newCounselorId_fkey" FOREIGN KEY ("newCounselorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CounselorChangeRequest" ADD CONSTRAINT "CounselorChangeRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
