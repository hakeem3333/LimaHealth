import type { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { z } from "zod";

// =======================
// 🧩 Zod Schema
// =======================
const createUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// =======================
// Create User Helper
// =======================
const createUser = async (
  req: AuthRequest,
  res: Response,
  roleName: "COUNSELOR" | "TEACHER" | "STUDENT",
) => {
  try {
    // 1. Authorization & Subscription Check
    const schoolId = req.user?.schoolId;

    if (!schoolId) {
      return res
        .status(403)
        .json({ message: "Access denied. No school context found." });
    }

    // 🛡️ NEW: Check school status before allowing data modification
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { status: true },
    });

    if (!school || school.status !== "ACTIVE") {
      const message =
        school?.status === "PAYMENT_REQUIRED"
          ? "Payment required to add new users."
          : "School account is not active.";

      return res.status(402).json({
        message,
        status: school?.status,
      });
    }

    // 2. Validation
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0].message,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { firstName, lastName, email, password } = parsed.data;

    // 3. Check Duplicates
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create User
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        school: { connect: { id: schoolId } },
        role: { connect: { name: roleName } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true } },
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: `${roleName.toLowerCase()} created successfully`,
      user,
    });
  } catch (err) {
    console.error(`Error adding ${roleName}:`, err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
// =======================
// Controllers
// =======================

// Note: Ensure these strings match the 'name' field in your Role table exactly
export const addCounsellor = (req: AuthRequest, res: Response) =>
  createUser(req, res, "COUNSELOR");

export const addTeacher = (req: AuthRequest, res: Response) =>
  createUser(req, res, "TEACHER");

export const addStudent = (req: AuthRequest, res: Response) =>
  createUser(req, res, "STUDENT");
