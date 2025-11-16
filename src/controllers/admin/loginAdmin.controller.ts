import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../services/prisma.service";
import { sendEmail } from "../../services/email.service";
import { z } from "zod";

// =======================
// 🧩 Zod Schema
// =======================
const adminLoginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters long"),
});

// =======================
// 🔐 Admin Login Step 1
// =======================
export const adminLoginStep1 = async (req: Request, res: Response) => {
  try {
    // ✅ Validate request body
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    // ✅ Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Not authorized" });
    }

    // ✅ Check password
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Generate OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.adminOtp.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    console.log("Admin login initiated for:", user.email);

    // ✅ Send OTP email
    await sendEmail({
      to: user.email,
      subject: "Your admin login code",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    // ✅ Create short-lived temporary JWT
    const tempToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "10m",
    });

    return res.status(200).json({
      message: "OTP sent to email",
      tempToken,
    });
  } catch (err) {
    console.error("Error in admin login step 1:", err);
    return res.status(500).json({
      message: "Server error during login. Please try again later.",
    });
  }
};
