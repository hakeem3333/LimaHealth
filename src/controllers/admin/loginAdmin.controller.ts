import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
// import crypto from "crypto";
import { generateOTP } from "../../utils/otp.util";
import prisma from "../../services/prisma.service";
import { sendAdminLoginOtpEmail } from "../../services/otpEmail.service";
import { signTempToken, verifyToken } from "../../utils/jwt.util";
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

// The code itself is short-lived; the "password already verified" session that
// lets the admin ask for a fresh one is longer, so resend works right after expiry.
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const TEMP_SESSION_MS = 30 * 60 * 1000;
const ALLOWED_ORG_STATUSES = ["ACTIVE", "PAYMENT_REQUIRED", "EXPIRED"];

const issueAdminOtp = async (user: {
  id: string;
  email: string;
  firstName: string;
  org?: { orgType?: string | null; name?: string | null } | null;
}) => {
  const code = generateOTP();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.adminOtp.upsert({
    where: { userId: user.id },
    update: { codeHash, expiresAt, attempts: 0 },
    create: { userId: user.id, codeHash, expiresAt },
  });

  await sendAdminLoginOtpEmail({
    to: user.email,
    name: user.firstName,
    code,
    orgType: user.org?.orgType,
    orgName: user.org?.name,
  });
};

const setAdminTempCookie = (res: Response, userId: string) => {
  res.cookie("admin_temp_token", signTempToken({ userId }, "ADMIN_OTP", "30m"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TEMP_SESSION_MS,
  });
};

// =======================
// 🔁 Admin Resend OTP
// =======================
// Uses the temp session from step 1 as proof the password was already verified.
// Expired-session errors are 403 (not 401) so the web client's 401 handler
// doesn't try to refresh a session that never existed.
export const adminResendOtp = async (req: Request, res: Response) => {
  const sessionExpired = () =>
    res.status(403).json({
      message: "Your sign-in session has expired. Please sign in again.",
      code: "SESSION_EXPIRED",
    });

  try {
    const tempToken = req.cookies?.admin_temp_token;
    if (!tempToken) return sessionExpired();

    const { decoded, valid } = verifyToken(tempToken);
    if (!valid || !decoded || (decoded as any).purpose !== "ADMIN_OTP") {
      return sessionExpired();
    }

    const user = await prisma.user.findUnique({
      where: { id: (decoded as any).userId },
      include: { role: true, org: true },
    });
    if (!user || user.role?.name !== "ORG_ADMIN" || !user.isActive) return sessionExpired();

    if (user.org && !ALLOWED_ORG_STATUSES.includes(user.org.status)) {
      return res.status(403).json({ message: "This account can't sign in right now." });
    }

    const existing = await prisma.adminOtp.findUnique({ where: { userId: user.id } });
    if (existing) {
      const issuedAt = existing.expiresAt.getTime() - OTP_TTL_MS;
      const waitMs = issuedAt + RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        return res.status(429).json({
          message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
        });
      }
    }

    await issueAdminOtp(user);
    setAdminTempCookie(res, user.id);

    return res.status(200).json({ message: "A new verification code has been sent to your email." });
  } catch (err) {
    console.error("Error in admin resend OTP:", err);
    return res.status(500).json({ message: "Couldn't send a new code. Please try again." });
  }
};

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

    // Deactivated by a Super Admin
    if (!user.isActive) {
      return res.status(403).json({
        message: "This admin account has been deactivated. Please contact support.",
      });
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

    // 4. Issue + email the OTP, and start the 2FA session
    await issueAdminOtp(user);
    setAdminTempCookie(res, user.id);

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

    // Used by both the admin web login and the mobile app login for org-type
    // theming, so any account with an org (not just ORG_ADMIN) resolves.
    const THEMEABLE_ROLES = ["ORG_ADMIN", "STUDENT", "COUNSELOR", "PARENT"];
    if (!user || !THEMEABLE_ROLES.includes(user.role?.name) || !user.org) {
      return res.status(200).json({ orgType: null });
    }

    return res.status(200).json({ orgType: user.org.orgType });
  } catch (err) {
    console.error("Error looking up org type:", err);
    return res.status(200).json({ orgType: null });
  }
};