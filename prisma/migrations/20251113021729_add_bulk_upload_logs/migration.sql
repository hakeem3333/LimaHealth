-- CreateTable
CREATE TABLE "public"."BulkUploadLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkUploadLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."BulkUploadLog" ADD CONSTRAINT "BulkUploadLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BulkUploadLog" ADD CONSTRAINT "BulkUploadLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
