import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import prisma from "../../services/prisma.service";
import { sendVerificationEmail } from "../../services/email.service";

// ====================
// 🧩 Zod Schemas
// ====================

const schoolSignupSchema = z.object({
  name: z.string().min(2, "School name must be at least 2 characters"),
  contact_email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  website: z
    .string()
    .url("Invalid website URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
});

const verifyEmailSchema = z.object({
  token: z.string().uuid("Invalid verification token format"),
});

// Helper to hash the UUID token before storing in DB
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

// ====================
// 🏫 Signup Controller
// ====================

export const schoolSignup = async (req: Request, res: Response) => {
  try {
    const parseResult = schoolSignupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({
          message: "Invalid input",
          errors: parseResult.error.flatten().fieldErrors,
        });
    }

    const { name, contact_email, password, website, firstName, lastName } =
      parseResult.data;

    // 1. Check for existing school/admin to prevent duplicates
    const existingSchool = await prisma.school.findFirst({
      where: { OR: [{ contact_email }, { name }] },
    });

    if (existingSchool) {
      return res
        .status(409)
        .json({ message: "A school with this name or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = uuidv4();
    const tokenHash = hashToken(rawToken);

    // 2. Database Transaction
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
          isActive: true,
          role: { connect: { name: "SCHOOL_ADMIN" } },
          school: { connect: { id: school.id } },
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          schoolId: school.id,
          token: tokenHash, // Store the hash, not the raw UUID
          expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });

      return { school, adminUser };
    });

    // 3. Send Email (Outside transaction to prevent DB bloat/locks)
    const emailResult = await sendVerificationEmail(contact_email, rawToken);

    return res.status(201).json({
      message: "Signup successful. Please verify your email.",
      schoolId: result.school.id,
      previewLink: emailResult?.preview, // Only if using a dev mailer like ethereal
    });
  } catch (error) {
    console.error("Error during signup:", error);
    return res
      .status(500)
      .json({ message: "Internal server error during signup" });
  }
};

// ====================
// ✉️ Verify Email Controller
// ====================

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const parseResult = verifyEmailSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid token" });
    }

    const { token } = parseResult.data;
    const incomingHash = hashToken(token);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token: incomingHash },
      include: { school: true },
    });

    if (!record) {
      return res
        .status(404)
        .json({ message: "Verification token is invalid or already used." });
    }

    if (record.expiresAt < new Date()) {
      return res
        .status(410)
        .json({
          message: "Token expired.",
          email: record.school.contact_email,
        });
    }

    // Atomic update and cleanup
    await prisma.$transaction([
      prisma.school.update({
        where: { id: record.schoolId },
        data: { status: "PENDING_ACTIVATION" },
      }),
      prisma.emailVerificationToken.delete({
        where: { id: record.id },
      }),
    ]);

    return res.json({
      verified: true,
      message: "Email verified! Your account is pending approval.",
    });
  } catch (error) {
    console.error("Error verifying email:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ====================
// 🔄 Resend Controller
// ====================

export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const school = await prisma.school.findUnique({
      where: { contact_email: email },
    });
    if (!school) return res.status(404).json({ message: "School not found" });

    const rawToken = uuidv4();
    const tokenHash = hashToken(rawToken);

    await prisma.$transaction([
      prisma.emailVerificationToken.deleteMany({
        where: { schoolId: school.id },
      }),
      prisma.emailVerificationToken.create({
        data: {
          token: tokenHash,
          schoolId: school.id,
          expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      }),
    ]);

    await sendVerificationEmail(email, rawToken);
    return res.json({ message: "Verification email resent." });
  } catch (error) {
    return res.status(500).json({ message: "Error resending email" });
  }
};
