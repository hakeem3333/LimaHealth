import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding roles & permissions...");

  const permissions = [
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

  // Create permissions
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm },
      update: {},
      create: { name: perm },
    });
  }

  const allPermissions = await prisma.permission.findMany();

  const roles = [
    { name: "SUPER_ADMIN", permissionNames: permissions },
    {
      name: "SCHOOL_ADMIN",
      permissionNames: [
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
      permissionNames: [
        "view_alerts",
        "resolve_alerts",
        "view_mood_logs",
        "view_biometric_data",
      ],
    },
    { name: "STUDENT", permissionNames: ["view_mood_logs"] },
    { name: "PARENT", permissionNames: ["view_mood_logs"] },
  ];

  const roleMap = {};

  for (const role of roles) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: { name: role.name },
    });

    roleMap[role.name] = createdRole;

    for (const permName of role.permissionNames) {
      const perm = allPermissions.find((p) => p.name === permName);
      if (!perm) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: createdRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: createdRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  console.log("🌱 RBAC seeding completed!");

  // ------------------------------
  // Create default SUPER_ADMIN user (env-based)
  // ------------------------------
  const defaultSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const defaultSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!defaultSuperAdminEmail || !defaultSuperAdminPassword) {
    throw new Error(
      "❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env"
    );
  }

  const hashedPassword = await bcrypt.hash(defaultSuperAdminPassword, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: defaultSuperAdminEmail },
    update: {},
    create: {
      schoolId: null, // Leave empty if global user
      firstName: "Super",
      lastName: "Admin",
      email: defaultSuperAdminEmail,
      passwordHash: hashedPassword,
      isActive: true,
      roleId: roleMap["SUPER_ADMIN"].id,
    },
  });

  console.log(`✨ Default SUPER_ADMIN user created: ${superAdmin.email}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
