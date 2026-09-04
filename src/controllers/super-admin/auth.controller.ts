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
import { sendEmail } from "../../services/email.service";
import { z } from "zod";

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

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

    const otpCode = generateOTP();
    const otpHash = await bcrypt.hash(otpCode, 10);

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

    await sendEmail({
      to: user.email,
      subject: "Super Admin Access Code",
      text: `Your security code is ${otpCode}. It expires in 5 minutes.`,
    });

    const tempToken = signTempToken({ userId: user.id, role: "SUPER_ADMIN" });

    res.cookie("super_temp_token", tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60 * 1000,
    });

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
    const refreshToken = signRefreshToken({ sub: userId });

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("super_access_token", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("super_refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/api/v1/super-admin/refresh-token",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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

    res.clearCookie("super_access_token", cookieOptions);
    res.clearCookie("super_refresh_token", {
      ...cookieOptions,
      path: "/api/v1/super-admin/refresh-token",
    });
    res.clearCookie("super_temp_token", cookieOptions);

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("[superAdminLogout] Error:", err);
    return res.status(500).json({ message: "Server error during logout" });
  }
};
