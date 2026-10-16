import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyToken,
  hashToken,
} from "../../utils/jwt.util";
import { generateOTP } from "../../utils/otp.util";
import { sendSuperAdminOtpEmail } from "../../services/otpEmail.service";
import {
  SUPER_REFRESH_JWT_EXPIRES_IN,
  SUPER_REFRESH_TTL_MS,
  setSuperSessionCookies,
  clearSuperSessionCookies,
} from "../../utils/superAdminSession.util";
import { z } from "zod";

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

// The code is short-lived (5 min); the "password verified" session that lets the
// Super Admin request a fresh one lasts longer, so resend works right after expiry.
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const TEMP_SESSION_MS = 15 * 60 * 1000;

const issueSuperAdminOtp = async (user: { id: string; email: string; firstName: string }) => {
  const code = generateOTP();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.adminOtp.upsert({
    where: { userId: user.id },
    update: { codeHash, expiresAt, attempts: 0 },
    create: { userId: user.id, codeHash, expiresAt },
  });

  await sendSuperAdminOtpEmail({ to: user.email, name: user.firstName, code });
};

const setSuperTempCookie = (res: Response, userId: string) => {
  res.cookie("super_temp_token", signTempToken({ userId, role: "SUPER_ADMIN" }, "ADMIN_OTP", "15m"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TEMP_SESSION_MS,
  });
};

/* -----------------------------------------------------------
   Super Admin Resend OTP
   403 (not 401) on an expired session so the web client's 401
   handler doesn't try to refresh a session that never existed.
----------------------------------------------------------- */
export const superAdminResendOtp = async (req: Request, res: Response) => {
  const sessionExpired = () =>
    res.status(403).json({
      message: "Your sign-in session has expired. Please sign in again.",
      code: "SESSION_EXPIRED",
    });

  try {
    const tempToken = req.cookies?.super_temp_token;
    if (!tempToken) return sessionExpired();

    const { decoded, valid } = verifyToken(tempToken);
    if (!valid || !decoded || (decoded as any).role !== "SUPER_ADMIN") return sessionExpired();

    const user = await prisma.user.findUnique({
      where: { id: (decoded as any).userId },
      include: { role: true },
    });
    if (!user || user.role?.name !== "SUPER_ADMIN") return sessionExpired();

    const existing = await prisma.adminOtp.findUnique({ where: { userId: user.id } });
    if (existing) {
      const waitMs = existing.expiresAt.getTime() - OTP_TTL_MS + RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        return res.status(429).json({
          message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
        });
      }
    }

    await issueSuperAdminOtp(user);
    setSuperTempCookie(res, user.id);

    return res.status(200).json({ message: "A new access code has been sent to your email." });
  } catch (err) {
    console.error("[superAdminResendOtp] Error:", err);
    return res.status(500).json({ message: "Couldn't send a new code. Please try again." });
  }
};

/* -----------------------------------------------------------
   Super Admin Login Step 1: Credentials & OTP Dispatch
----------------------------------------------------------- */
export const superAdminLoginStep1 = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    // Intentionally vague — don't reveal whether email or password was wrong
    if (!user || user.role?.name !== "SUPER_ADMIN") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await issueSuperAdminOtp(user);
    setSuperTempCookie(res, user.id);

    return res.status(200).json({ message: "OTP sent to super admin email" });
  } catch (err) {
    console.error("[superAdminLoginStep1] Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* -----------------------------------------------------------
   Super Admin Login Step 2: OTP Verification & Final Session
----------------------------------------------------------- */
export const superAdminVerifyOtp = async (req: Request, res: Response) => {
  try {
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }
    const { otp } = parsed.data;

    const tempToken = req.cookies?.super_temp_token;
    if (!tempToken) {
      return res.status(401).json({ message: "Session expired" });
    }

    const { decoded, valid, error } = verifyToken(tempToken);
    if (!valid || (decoded as any).role !== "SUPER_ADMIN") {
      return res.status(403).json({
        message:
          error === "TokenExpiredError" ? "Session expired." : "Unauthorized scope",
      });
    }

    const userId = (decoded as any).userId;

    const record = await prisma.adminOtp.findUnique({ where: { userId } });
    if (!record) {
      return res.status(400).json({ message: "Invalid OTP session" });
    }

    if (record.expiresAt < new Date()) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.attempts >= 5) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res.status(429).json({ message: "Too many attempts." });
    }

    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.adminOtp.update({
        where: { userId },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await prisma.adminOtp.delete({ where: { userId } });
    res.clearCookie("super_temp_token");

    // Super admins have no school, so schoolStatus is omitted
    const accessToken = signAccessToken({ sub: userId, role: "SUPER_ADMIN" });
    const refreshToken = signRefreshToken({ sub: userId }, SUPER_REFRESH_JWT_EXPIRES_IN);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + SUPER_REFRESH_TTL_MS),
      },
    });

    setSuperSessionCookies(res, { accessToken, refreshToken }, SUPER_REFRESH_TTL_MS);

    return res.status(200).json({
      message: "Super Admin verified",
      user: { id: userId, role: "SUPER_ADMIN" },
    });
  } catch (err) {
    console.error("[superAdminVerifyOtp] Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* -----------------------------------------------------------
   Super Admin Logout
----------------------------------------------------------- */
export const superAdminLogout = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.super_refresh_token;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(refreshToken) },
      });
    }

    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = { httpOnly: true, secure: isProd, sameSite: "strict" as const };

    clearSuperSessionCookies(res);
    res.clearCookie("super_temp_token", cookieOptions);

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("[superAdminLogout] Error:", err);
    return res.status(500).json({ message: "Server error during logout" });
  }
};
