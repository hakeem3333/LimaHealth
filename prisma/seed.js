import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function safeHash(password) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("🌱 Starting RBAC seed...");

  // Validate env early
  const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "").trim();
  const SUPER_ADMIN_PASSWORD = (process.env.SUPER_ADMIN_PASSWORD || "").trim();

  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error(
      "Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD in .env (they must be set)"
    );
  }

  // ---- Permissions ----
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

  await prisma.permission.createMany({
    data: permissionsList.map((name) => ({ name })),
    skipDuplicates: true,
  });
  console.log(`✅ Permissions upserted (${permissionsList.length})`);

  const allPermissions = await prisma.permission.findMany({
    select: { id: true, name: true },
  });

  const permByName = Object.fromEntries(
    allPermissions.map((p) => [p.name, p.id])
  );

  // ---- Roles (UPDATED) ----
  const rolesDefinition = [
    { name: "SUPER_ADMIN", permissionNames: [] }, // gets all permissions
    {
      name: "ADMIN",
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
    { name: "USER", permissionNames: ["view_mood_logs"] },
    { name: "PARENT", permissionNames: ["view_mood_logs"] },
  ];

  const upsertRolePromises = rolesDefinition.map((r) =>
    prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: { name: r.name },
      select: { id: true, name: true },
    })
  );

  const upsertedRoles = await Promise.all(upsertRolePromises);

  const roleByName = Object.fromEntries(
    upsertedRoles.map((r) => [r.name, r.id])
  );

  console.log(`✅ Roles upserted (${upsertedRoles.length})`);

  // ---- RolePermission mappings ----
  const rows = [];

  for (const roleDef of rolesDefinition) {
    const roleId = roleByName[roleDef.name];

    let permsForRole = roleDef.permissionNames.slice();

    if (roleDef.name === "SUPER_ADMIN") {
      permsForRole = allPermissions.map((p) => p.name); // assign ALL
    }

    for (const permName of permsForRole) {
      const permissionId = permByName[permName];
      if (!permissionId) {
        console.warn(`⚠️ Permission "${permName}" not found, skipping`);
        continue;
      }
      rows.push({ roleId, permissionId });
    }
  }

  if (rows.length > 0) {
    await prisma.rolePermission.createMany({
      data: rows,
      skipDuplicates: true,
    });
    console.log(`✅ RolePermission mappings created (${rows.length})`);
  } else {
    console.log("ℹ️ No role-permission mappings created");
  }

  // ---- Create default SUPER_ADMIN ----
  const hashedPassword = await safeHash(SUPER_ADMIN_PASSWORD);

  const superAdmin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
      roleId: roleByName["SUPER_ADMIN"],
    },
    create: {
      firstName: "Super",
      lastName: "Admin",
      email: SUPER_ADMIN_EMAIL,
      passwordHash: hashedPassword,
      isActive: true,
      roleId: roleByName["SUPER_ADMIN"],
      schoolId: null,
    },
  });

  console.log(`✨ Default SUPER_ADMIN ensured: ${superAdmin.email}`);
  console.log("🌱 Seed finished successfully.");
}

// Run
main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
