import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting RBAC seed...");

  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL?.trim();
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD?.trim();

  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error(
      "Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD in .env",
    );
  }

  // 1. ---- Permissions ----
  const permissionsList = [
    "manage_schools",
    "manage_admins",
    "manage_counselors",
    "manage_students",
    "view_alerts",
    "resolve_alerts",
    "view_biometric_data",
    "view_mood_logs",
    "manage_subscriptions",
    "bulk_upload",
  ];

  // Upsert permissions individually or use createMany
  await prisma.permission.createMany({
    data: permissionsList.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const allPermissions = await prisma.permission.findMany();
  const permByName = Object.fromEntries(
    allPermissions.map((p) => [p.name, p.id]),
  );

  // 2. ---- Roles Definition ----
  const rolesDefinition = [
    { name: "SUPER_ADMIN", permissions: permissionsList }, // All perms
    {
      name: "SCHOOL_ADMIN",
      permissions: [
        "manage_counselors",
        "manage_students",
        "view_alerts",
        "resolve_alerts",
        "view_biometric_data",
        "bulk_upload",
      ],
    },
    {
      name: "COUNSELOR",
      permissions: [
        "view_alerts",
        "resolve_alerts",
        "view_mood_logs",
        "view_biometric_data",
      ],
    },
    { name: "STUDENT", permissions: ["view_mood_logs"] },
    { name: "PARENT", permissions: ["view_mood_logs"] },
  ];

  for (const roleDef of rolesDefinition) {
    // 3. ---- Upsert Role & Sync Permissions ----
    // We use 'set' to ensure the database matches the script exactly
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {},
      create: { name: roleDef.name },
    });

    console.log(`Syncing permissions for role: ${role.name}`);

    // Clean up existing permissions for this role and set new ones
    // This handles the "drift" issue mentioned above.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    await prisma.rolePermission.createMany({
      data: roleDef.permissions
        .map((pName) => ({
          roleId: role.id,
          permissionId: permByName[pName],
        }))
        .filter((item) => item.permissionId !== undefined),
    });
  }

  // 4. ---- Create default SUPER_ADMIN ----
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const superRole = await prisma.role.findUnique({
    where: { name: "SUPER_ADMIN" },
  });

  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { roleId: superRole.id },
    create: {
      firstName: "Super",
      lastName: "Admin",
      email: SUPER_ADMIN_EMAIL,
      passwordHash: hashedPassword,
      isActive: true,
      roleId: superRole.id,
    },
  });

  console.log(`✨ Seed finished. SuperAdmin: ${SUPER_ADMIN_EMAIL}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
