import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "../../utils/jwt.util";
import { z } from "zod";

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

export const adminLoginStep2 = async (req: Request, res: Response) => {
  try {
    // 1️⃣ Validate body
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }
    const { otp } = parsed.data;

    // 2️⃣ Extract temp token from COOKIES
    const tempToken = req.cookies?.admin_temp_token;
    if (!tempToken) {
      return res
        .status(401)
        .json({ message: "OTP session expired. Please login again." });
    }

    // 3️⃣ Verify temp token
    const { decoded, valid, error } = verifyToken(tempToken);
    if (!valid) {
      return res.status(401).json({
        message:
          error === "TokenExpiredError"
            ? "Session expired."
            : "Invalid session.",
      });
    }

    const userId = (decoded as any).userId;

    // 4️⃣ Fetch OTP record & User (Enriched to get actual role and school status)
    const [record, user] = await Promise.all([
      prisma.adminOtp.findUnique({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        include: { role: true, school: true },
      }),
    ]);

    if (!record || !user) {
      return res
        .status(400)
        .json({ message: "Invalid OTP session or user no longer exists" });
    }

    // 5️⃣ Expiry and Attempt check
    if (record.expiresAt < new Date()) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.attempts >= 5) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res
        .status(429)
        .json({ message: "Too many attempts. Please login again." });
    }

    // 6️⃣ OTP comparison
    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.adminOtp.update({
        where: { userId },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // 7️⃣ SUCCESS: Cleanup
    await prisma.adminOtp.delete({ where: { userId } });
    res.clearCookie("admin_temp_token");

    // 8️⃣ Issue Real Access + Refresh Tokens
    const accessToken = signAccessToken({
      sub: userId,
      role: user.role.name,
      schoolId: user.schoolId,
    });
    const refreshToken = signRefreshToken({ sub: userId });

    // 9️⃣ Store Refresh Token
    await prisma.refreshToken.create({
      data: {
        userId: userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 🔟 Set Security Cookies
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // 🆕 Set School Status Cookie for Next.js Middleware
    if (user.school?.status) {
      res.cookie("school_status", user.school.status, {
        httpOnly: false, // Middleware needs to read this
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // Sync with refresh token
      });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: userId,
        role: user.role.name,
        schoolStatus: user.school?.status,
      },
    });
  } catch (err) {
    console.error("Admin OTP verification error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
