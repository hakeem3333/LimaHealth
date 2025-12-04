import prisma from "../src/services/prisma.service.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

async function createSuperAdmin() {
  try {
    console.log("🚀 Creating Super Admin...");

    // Load super admin config from .env
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;
    const firstName = process.env.SUPERADMIN_FIRSTNAME || "Super";
    const lastName = process.env.SUPERADMIN_LASTNAME || "Admin";
    const roleName = process.env.SUPERADMIN_ROLE || "SUPERADMIN";

    // Validate env values
    if (!email || !password) {
      console.error(
        "❌ Missing SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD in .env"
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // 1️⃣ Ensure role exists
    let role = await prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      console.log(`🔧 Role '${roleName}' not found. Creating...`);
      role = await prisma.role.create({
        data: { name: roleName },
      });
    }

    // 2️⃣ Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log("⚠️ Super Admin already exists with email:", email);
      process.exit(0);
    }

    // 3️⃣ Create super admin user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        roleId: role.id,
        isActive: true,
      },
    });

    console.log("✅ Super Admin created successfully:");
    console.log("Email:", user.email);
    console.log("Password:", password);
    console.log("‼️ IMPORTANT: Change this password immediately.");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    process.exit(1);
  }
}

createSuperAdmin();
