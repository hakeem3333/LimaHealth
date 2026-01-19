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
import { sendMail } from "../../services/email.service";
import { z } from "zod";

// --- Validation Schema ---
const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

/* -----------------------------------------------------------
   1️⃣ Super Admin Login Step 1: Credentials & OTP Dispatch
----------------------------------------------------------- */
export const superAdminLoginStep1 = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // 1. Verify User exists and is a Super Admin
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user || user.role.name !== "SUPER_ADMIN") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 2. Verify Password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    // 3. Generate & Hash OTP
    const otpCode = generateOTP();
    const otpHash = await bcrypt.hash(otpCode, 10);

    // 4. Save to DB
    await prisma.adminOtp.upsert({
      where: { userId: user.id },
      update: {
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
        attempts: 0,
      },
      create: {
        userId: user.id,
        codeHash: otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // 5. Send Email
    await sendMail({
      to: user.email,
      subject: "Super Admin Access Code",
      text: `Your security code is ${otpCode}.`,
    });

    // 6. Issue Namespaced Temp Token
    const tempToken = signTempToken({
      userId: user.id,
      role: "SUPER_ADMIN",
    });

    res.cookie("super_temp_token", tempToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60 * 1000, // 10 mins
    });

    return res.status(200).json({ message: "OTP sent to super admin" });
  } catch (err) {
    console.error("Super Admin Step 1 Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* -----------------------------------------------------------
   2️⃣ Super Admin Login Step 2: OTP Verification & Final Session
----------------------------------------------------------- */
export const superAdminVerifyOtp = async (req: Request, res: Response) => {
  try {
    // 1. Validate OTP Format
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }
    const { otp } = parsed.data;

    // 2. Extract Namespaced Temp Token
    const tempToken = req.cookies?.super_temp_token;
    if (!tempToken) return res.status(401).json({ message: "Session expired" });

    // 3. Verify token utility
    const { decoded, valid, error } = verifyToken(tempToken);
    if (!valid || (decoded as any).role !== "SUPER_ADMIN") {
      return res.status(403).json({
        message:
          error === "TokenExpiredError"
            ? "Session expired."
            : "Unauthorized scope",
      });
    }

    const userId = (decoded as any).userId;

    // 4. Fetch OTP record
    const record = await prisma.adminOtp.findUnique({ where: { userId } });
    if (!record)
      return res.status(400).json({ message: "Invalid OTP session" });

    // 5. Expiry and Attempt check
    if (record.expiresAt < new Date()) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.attempts >= 5) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res.status(429).json({ message: "Too many attempts." });
    }

    // 6. OTP comparison
    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.adminOtp.update({
        where: { userId },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // 7. SUCCESS: Cleanup
    await prisma.adminOtp.delete({ where: { userId } });
    res.clearCookie("super_temp_token");

    // 8. Issue Final Tokens
    const accessToken = signAccessToken({ sub: userId, role: "SUPER_ADMIN" });
    const refreshToken = signRefreshToken({ sub: userId });

    // 9. Store Hashed Refresh Token
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 10. Set Namespaced Cookies
    res.cookie("super_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie("super_refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth/super/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      message: "Super Admin verified",
      user: { id: userId, role: "SUPER_ADMIN" },
    });
  } catch (err) {
    console.error("Super Admin Verification Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
