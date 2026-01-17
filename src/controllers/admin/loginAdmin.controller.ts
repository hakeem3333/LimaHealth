import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../../services/prisma.service";
import { sendEmail } from "../../services/email.service";
import { signTempToken } from "../../utils/jwt.util"; // Using the helper we created
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
    // Validate request body
    const parsed = adminLoginSchema.safeParse(req.body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstErrorMessage =
        Object.values(fieldErrors).flat()[0] || "Invalid input";

      return res.status(400).json({
        message: firstErrorMessage,
        errors: fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    // Find user and verify role
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    const ALLOWED_ROLES = ["SCHOOL_ADMIN"];

    // Security tip: Use a generic error message to prevent account enumeration
    if (!user || !ALLOWED_ROLES.includes(user.role?.name ?? "")) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    // Check password
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Prepare OTP
    const code = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(code, 10);

    // Upsert OTP (Update if exists, create if not) to prevent unique constraint errors
    await prisma.adminOtp.upsert({
      where: { userId: user.id },
      update: {
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0, // Reset attempts on new login request
      },
      create: {
        userId: user.id,
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Send OTP email
    await sendEmail({
      to: user.email,
      subject: "Your admin login code",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    // Create temporary JWT and set as HTTP-only Cookie
    // This token only allows access to the /verify-otp route
    const tempToken = signTempToken({ userId: user.id });

    res.cookie("admin_temp_token", tempToken, {
      httpOnly: true, // Prevents JS from reading the token (XSS protection)
      secure: process.env.NODE_ENV === "production", // Only send over HTTPS in prod
      sameSite: "strict", // Protects against CSRF
      maxAge: 5 * 60 * 1000, // 5 minutes (matches OTP expiry)
    });

    console.log(`Admin login initiated for: ${user.email}`);

    return res.status(200).json({
      message: "A verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("Error in admin login step 1:", err);
    return res.status(500).json({
      message: "Server error during login. Please try again later.",
    });
  }
};
