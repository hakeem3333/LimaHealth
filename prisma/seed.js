import { PrismaClient } from "@prisma/client";
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
    {
      name: "SUPER_ADMIN",
      permissionNames: permissions,
    },
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
    {
      name: "STUDENT",
      permissionNames: ["view_mood_logs"],
    },
    {
      name: "PARENT",
      permissionNames: ["view_mood_logs"],
    },
  ];

  for (const role of roles) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: { name: role.name },
    });

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

  console.log("✨ RBAC seeding completed!");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
