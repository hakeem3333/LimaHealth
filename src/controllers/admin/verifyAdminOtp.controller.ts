import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
// import cookieParser from "cookie-parser";
import prisma from "../../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "../../utils/jwt.util"; // Use our safe helpers
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

    // 8️⃣ Issue Real Access + Refresh Tokens (Using DB role, not hardcoded string)
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
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: userId,
        role: user.role.name,
        schoolStatus: user.school?.status, // 👈 Vital for frontend redirection
      },
    });
  } catch (err) {
    console.error("Admin OTP verification error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
