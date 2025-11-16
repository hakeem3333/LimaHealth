-- Enforce only one ADMIN per school
CREATE UNIQUE INDEX IF NOT EXISTS one_admin_per_school_idx
ON "User" ("schoolId")
WHERE role = 'ADMIN';