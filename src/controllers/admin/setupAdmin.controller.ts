import type { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { z } from "zod";

// =======================
// 🧩 Zod Schema
// =======================
const createUserSchema = z.object({
  firstName: z
    .string({ required_error: "First name is required" })
    .min(1, "First name cannot be empty"),
  lastName: z
    .string({ required_error: "Last name is required" })
    .min(1, "Last name cannot be empty"),
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters"),
});

// =======================
// 🧑‍🏫 Create User Helper
// =======================
const createUser = async (
  req: AuthRequest,
  res: Response,
  role: "COUNSELOR" | "TEACHER" | "STUDENT"
) => {
  try {
    // ✅ Validate request body
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { firstName, lastName, email, password } = parsed.data;
    const schoolId = req.user?.schoolId;

    if (!schoolId) {
      return res.status(403).json({ message: "No school context" });
    }

    // ✅ Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        role,
        schoolId,
      },
    });

    return res.status(201).json({
      message: `${role.charAt(0)}${role
        .slice(1)
        .toLowerCase()} created successfully`,
      user,
    });
  } catch (err) {
    console.error(`Error adding ${role.toLowerCase()}:`, err);
    return res.status(500).json({ message: "Server error" });
  }
};

// =======================
// 👥 Controllers
// =======================
export const addCounsellor = (req: AuthRequest, res: Response) =>
  createUser(req, res, "COUNSELOR");

export const addTeacher = (req: AuthRequest, res: Response) =>
  createUser(req, res, "TEACHER");

export const addStudent = (req: AuthRequest, res: Response) =>
  createUser(req, res, "STUDENT");
