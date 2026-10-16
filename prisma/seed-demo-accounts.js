import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// The accounts seed-demo-olivia.js builds on: an active demo school, its org
// admin, a counselor, and Olivia assigned to that counselor. Safe to re-run
// (upserts by email). All three share DEMO_USER_PASSWORD from .env.
//
//   node prisma/seed.js                 # roles, permissions, super admin
//   node prisma/seed-demo-accounts.js   # this file
//   node prisma/seed-demo-olivia.js     # Olivia's demo data
// ---------------------------------------------------------------------------

const ORG_NAME = "Demo School";
const ORG_ADMIN = { firstName: "Daniel", lastName: "Adams", email: "orgadmin.demo@example.com" };
const COUNSELOR = { firstName: "Grace", lastName: "Okafor", email: "counselor.demo@example.com" };
const STUDENT = {
  firstName: "Olivia", lastName: "Wilson", email: "olivia.wilson@example.com",
  dateOfBirth: new Date("2005-04-12T00:00:00Z"), // adult, so no parental-consent gate
};

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
    throw new Error(`Refusing to seed demo accounts into non-local database host "${dbHost}"`);
  }
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  if (!password) throw new Error("Missing DEMO_USER_PASSWORD in .env");

  const roles = Object.fromEntries(
    (await prisma.role.findMany()).map((r) => [r.name, r.id]),
  );
  for (const r of ["ORG_ADMIN", "COUNSELOR", "STUDENT"]) {
    if (!roles[r]) throw new Error(`${r} role missing — run \`node prisma/seed.js\` first`);
  }

  const org =
    (await prisma.organisation.findFirst({ where: { name: ORG_NAME } })) ??
    (await prisma.organisation.create({
      data: { name: ORG_NAME, contact_email: ORG_ADMIN.email, orgType: "SCHOOL", status: "ACTIVE" },
    }));

  const passwordHash = await bcrypt.hash(password, 10);
  const upsertUser = (person, roleName, extra = {}) =>
    prisma.user.upsert({
      where: { email: person.email },
      update: { orgId: org.id, roleId: roles[roleName], ...extra },
      create: { ...person, passwordHash, orgId: org.id, roleId: roles[roleName], isActive: true, ...extra },
    });

  await upsertUser(ORG_ADMIN, "ORG_ADMIN");
  const counselor = await upsertUser(COUNSELOR, "COUNSELOR", { isAvailable: true });
  const student = await upsertUser(STUDENT, "STUDENT", { assignedCounselorId: counselor.id });

  await prisma.consent.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id, consentGiven: true },
  });

  console.log(`✨ Demo accounts ready in "${ORG_NAME}":`);
  console.log(`   org admin  ${ORG_ADMIN.email}`);
  console.log(`   counselor  ${COUNSELOR.email}`);
  console.log(`   student    ${STUDENT.email}`);
  console.log("   password   DEMO_USER_PASSWORD from .env");
}

main()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
