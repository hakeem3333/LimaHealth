import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import prisma from "../../services/prisma.service";
import { sendVerificationEmail } from "../../services/email.service";

// ====================
// 🧩 Zod Schemas
// ====================

const schoolSignupSchema = z.object({
  name: z
    .string({ required_error: "School name is required" })
    .min(2, "School name must be at least 2 characters"),
  contact_email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters long"),
  website: z
    .string()
    .url("Invalid website URL")
    .optional()
    .or(z.literal("").transform(() => undefined)), // Allow empty string
  firstName: z
    .string({ required_error: "First name is required" })
    .min(2, "First name must be at least 2 characters"),
  lastName: z
    .string({ required_error: "Last name is required" })
    .min(2, "Last name must be at least 2 characters"),
});

const verifyEmailSchema = z.object({
  token: z.string().uuid("Invalid verification token format"),
});

// ====================
// 🏫 Signup Controller
// ====================

export const schoolSignup = async (req: Request, res: Response) => {
  try {
    // ✅ Validate request body
    const parseResult = schoolSignupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, contact_email, password, website, firstName, lastName } =
      parseResult.data;

    // ✅ Check if another admin already exists for this school
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
        school: { name },
      },
    });

    if (existingAdmin) {
      return res
        .status(400)
        .json({ message: "An admin already exists for this school" });
    }

    // ✅ Check if school already exists by email
    const existingSchool = await prisma.school.findUnique({
      where: { contact_email },
    });

    if (existingSchool) {
      return res
        .status(409)
        .json({ message: "A school with this email already exists" });
    }

    // ✅ Check duplicate school name
    const existingByName = await prisma.school.findUnique({
      where: { name },
    });
    if (existingByName) {
      return res
        .status(409)
        .json({ message: "A school with this name already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Wrap everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { name, contact_email, website },
      });

      const adminUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: contact_email,
          passwordHash: hashedPassword,
          role: "ADMIN",
          schoolId: school.id,
        },
      });

      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

      await tx.emailVerificationToken.create({
        data: { schoolId: school.id, token, expiresAt },
      });

      const emailResult = await sendVerificationEmail(contact_email, token);

      if (!emailResult) throw new Error("Failed to send verification email");

      return { school, adminUser, emailResult };
    });

    const { school, adminUser, emailResult } = result;

    return res.status(201).json({
      message: "Signup successful. Please verify your email.",
      schoolId: school.id,
      adminUserId: adminUser.id,
      previewLink: emailResult?.preview,
    });
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({
      message: "Internal server error during signup",
    });
  }
};

// ====================
// ✉️ Verify Email Controller
// ====================

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const parseResult = verifyEmailSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid token",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { token } = parseResult.data;

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record) {
      return res.status(404).send("Token not found or expired");
    }

    await prisma.school.update({
      where: { id: record.schoolId },
      data: { status: "ACTIVE" },
    });

    await prisma.emailVerificationToken.delete({ where: { id: record.id } });

    res.send("Email verified successfully! Your school is now active.");
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).send("Internal server error");
  }
};
