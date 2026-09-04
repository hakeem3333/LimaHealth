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

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        org: true,
      },
    });

    const ALLOWED_ROLES = ["ORG_ADMIN"];

    if (!user || !ALLOWED_ROLES.includes(user.role?.name ?? "")) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    // 🛡️ 2. Check password before revealing any org status details
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // 3. Org status check
    if (user.org) {
      const status = user.org.status;

      if (status === "PENDING_EMAIL_VERIFICATION") {
        return res.status(403).json({
          message: "Please verify your email before logging in.",
        });
      }

      if (status === "PENDING_ACTIVATION") {
        return res.status(403).json({
          message:
            "Your account is pending Super Admin approval. You will receive an email once approved.",
          status: "PENDING_APPROVAL",
          orgType: user.org.orgType,
          orgName: user.org.name,
        });
      }

      // ✅ ALLOW: ACTIVE, PAYMENT_REQUIRED, and EXPIRED
      // We allow these so they can enter the app and see the "Payment Required" or "Expired" screens.
      const allowedToLogin = ["ACTIVE", "PAYMENT_REQUIRED", "EXPIRED"];

      if (!allowedToLogin.includes(status)) {
        return res.status(403).json({
          message: `Your organisation account is ${status.toLowerCase().replace("_", " ")}. Please contact support.`,
        });
      }
    }

    // 4. Prepare OTP
    const code = generateOTP();
    const otpHash = await bcrypt.hash(code, 10);

    await prisma.adminOtp.upsert({
      where: { userId: user.id },
      update: {
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      },
      create: {
        userId: user.id,
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // 5. Send OTP email
    await sendEmail({
      to: user.email,
      subject: "Your admin login code",
      text: `Your OTP is ${code}. It expires in 10 minutes.`,
    });

    const tempToken = signTempToken({ userId: user.id });

    res.cookie("admin_temp_token", tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60 * 1000,
    });

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

// =======================
// 🔎 Org type lookup (for login-page theming — does not confirm password or account existence)
// =======================
export const getOrgTypeByEmail = async (req: Request, res: Response) => {
  try {
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    if (!email) {
      return res.status(200).json({ orgType: null });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, org: true },
    });

    if (!user || user.role?.name !== "ORG_ADMIN" || !user.org) {
      return res.status(200).json({ orgType: null });
    }

    return res.status(200).json({ orgType: user.org.orgType });
  } catch (err) {
    console.error("Error looking up org type:", err);
    return res.status(200).json({ orgType: null });
  }
};