-- The init migration (20251127222921_init_rbac_setup) already creates
-- Consent_userId_key. This migration was redundant on a clean history and
-- broke shadow-database replay (P3006: "relation already exists") for
-- every subsequent `prisma migrate dev`. Made idempotent so replay succeeds
-- while remaining a no-op wherever the index already exists.
CREATE UNIQUE INDEX IF NOT EXISTS "Consent_userId_key" ON "Consent"("userId");
