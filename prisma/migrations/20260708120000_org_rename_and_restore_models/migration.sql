-- ============================================================
-- 1. Rename School -> Organisation, add orgType column
-- ============================================================
ALTER TABLE "School" RENAME TO "Organisation";
ALTER TABLE "Organisation" RENAME CONSTRAINT "School_pkey" TO "Organisation_pkey";
ALTER INDEX "School_name_key" RENAME TO "Organisation_name_key";
ALTER INDEX "School_contact_email_key" RENAME TO "Organisation_contact_email_key";

CREATE TYPE "OrgType" AS ENUM ('SCHOOL', 'COMPANY', 'HOSPITAL', 'NGO');
ALTER TABLE "Organisation" ADD COLUMN "orgType" "OrgType" NOT NULL DEFAULT 'SCHOOL';

ALTER TYPE "SchoolStatus" RENAME TO "OrgStatus";
ALTER TYPE "OrgStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REQUIRED';
ALTER TYPE "OrgStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- ============================================================
-- 2. User.schoolId -> User.orgId
-- ============================================================
ALTER TABLE "User" RENAME COLUMN "schoolId" TO "orgId";
ALTER TABLE "User" RENAME CONSTRAINT "User_schoolId_fkey" TO "User_orgId_fkey";
ALTER INDEX "User_schoolId_idx" RENAME TO "User_orgId_idx";

-- ============================================================
-- 3. Subscription.schoolId -> Subscription.orgId
-- ============================================================
ALTER TABLE "Subscription" RENAME COLUMN "schoolId" TO "orgId";
ALTER TABLE "Subscription" RENAME CONSTRAINT "Subscription_schoolId_fkey" TO "Subscription_orgId_fkey";

-- ============================================================
-- 4. EmailVerificationToken.schoolId -> orgId
-- ============================================================
ALTER TABLE "EmailVerificationToken" RENAME COLUMN "schoolId" TO "orgId";
ALTER TABLE "EmailVerificationToken" RENAME CONSTRAINT "EmailVerificationToken_schoolId_fkey" TO "EmailVerificationToken_orgId_fkey";
ALTER INDEX "EmailVerificationToken_schoolId_idx" RENAME TO "EmailVerificationToken_orgId_idx";

-- ============================================================
-- 5. BulkUploadLog.schoolId -> orgId (table + FK preserved, now points at Organisation)
-- ============================================================
ALTER TABLE "BulkUploadLog" RENAME COLUMN "schoolId" TO "orgId";
ALTER TABLE "BulkUploadLog" RENAME CONSTRAINT "BulkUploadLog_schoolId_fkey" TO "BulkUploadLog_orgId_fkey";

-- ============================================================
-- 6. AuditLog: add metadata column used by the settings audit trail
-- ============================================================
ALTER TABLE "AuditLog" ADD COLUMN "metadata" JSONB;

-- ============================================================
-- 7. PlatformSettings: rename columns to match application code
-- ============================================================
ALTER TABLE "PlatformSettings" RENAME COLUMN "allowSchoolSignup" TO "allowOrgSignup";
ALTER TABLE "PlatformSettings" RENAME COLUMN "defaultSchoolStatus" TO "defaultOrgStatus";
ALTER TABLE "PlatformSettings" RENAME COLUMN "adminOtpsExpiryMinutes" TO "adminOtpExpiryMinutes";
