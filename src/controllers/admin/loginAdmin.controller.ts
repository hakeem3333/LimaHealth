import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
// import crypto from "crypto";
import { generateOTP } from "../../utils/otp.util";
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

    // 1. Fetch user, their role, and their school status
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        school: true, // 👈 Include school to check status
      },
    });

    const ALLOWED_ROLES = ["SCHOOL_ADMIN"];

    if (!user || !ALLOWED_ROLES.includes(user.role?.name ?? "")) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    // 2. Check if the school is fully activated
    if (user.school) {
      if (user.school.status === "PENDING_EMAIL_VERIFICATION") {
        return res.status(403).json({
          message: "Please verify your email before logging in.",
        });
      }

      if (user.school.status === "PENDING_ACTIVATION") {
        return res.status(403).json({
          message: "Your school account is pending LimaHealth Admin approval.",
        });
      }

      if (user.school.status !== "ACTIVE") {
        return res.status(403).json({
          message: "Your school account is currently inactive or suspended.",
        });
      }
    }

    // 3. Check password
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // 4. Prepare OTP
    const code = generateOTP();
    const otpHash = await bcrypt.hash(code, 10);

    await prisma.adminOtp.upsert({
      where: { userId: user.id },
      update: {
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
      },
      create: {
        userId: user.id,
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // 5. Send OTP email
    await sendEmail({
      to: user.email,
      subject: "Your admin login code",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    const tempToken = signTempToken({ userId: user.id });

    res.cookie("admin_temp_token", tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60 * 1000,
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