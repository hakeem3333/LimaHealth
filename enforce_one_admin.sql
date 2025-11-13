-- Enforce only one ADMIN per school
-- npx prisma db execute --file ./enforce_one_admin.sql --schema ./prisma/schema.prisma

CREATE UNIQUE INDEX IF NOT EXISTS one_admin_per_school_idx
ON "User" ("schoolId")
WHERE role = 'ADMIN';