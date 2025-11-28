import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function safeHash(password) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log("🌱 Starting optimized RBAC seed...");

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

  // Use createMany for bulk insert + skip duplicates (faster)
  await prisma.permission.createMany({
    data: permissionsList.map((name) => ({ name })),
    skipDuplicates: true,
  });
  console.log(`✅ Permissions upserted (${permissionsList.length})`);

  // Fetch fresh permissions (id + name)
  const allPermissions = await prisma.permission.findMany({
    select: { id: true, name: true },
  });
  const permByName = Object.fromEntries(
    allPermissions.map((p) => [p.name, p.id])
  );

  // ---- Roles ----
  const rolesDefinition = [
    // SUPER_ADMIN will be assigned all permissions programmatically below (Option A)
    { name: "SUPER_ADMIN", permissionNames: [] }, // placeholder
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

  // Upsert roles in parallel
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

  // ---- RolePermission mappings (bulk) ----
  // Build mapping rows: SUPER_ADMIN gets ALL permissions (option A)
  const rows = [];

  for (const roleDef of rolesDefinition) {
    const roleId = roleByName[roleDef.name];
    let permsForRole = roleDef.permissionNames.slice();

    if (roleDef.name === "SUPER_ADMIN") {
      // assign all permissions present in DB
      permsForRole = allPermissions.map((p) => p.name);
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
    // createMany supports skipDuplicates to avoid unique constraint errors
    await prisma.rolePermission.createMany({
      data: rows,
      skipDuplicates: true,
    });
    console.log(`✅ RolePermission mappings created (${rows.length})`);
  } else {
    console.log("ℹ️ No role-permission mappings to create");
  }

  // ---- Create default SUPER_ADMIN user ----
  const hashedPassword = await safeHash(SUPER_ADMIN_PASSWORD);

  // Upsert user (schoolId omitted for global user)
  const superAdmin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
      roleId: roleByName["SUPER_ADMIN"],
      // do not update password unless you explicitly want to; update here is empty
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
    console.error("❌ Seed failed:", err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
