-- CreateTable
CREATE TABLE "public"."ParentConsentToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "decision" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentConsentToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentConsentToken_tokenHash_key" ON "public"."ParentConsentToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "public"."ParentConsentToken" ADD CONSTRAINT "ParentConsentToken_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentConsentToken" ADD CONSTRAINT "ParentConsentToken_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
