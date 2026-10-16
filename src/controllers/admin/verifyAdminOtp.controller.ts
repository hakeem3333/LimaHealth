import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "../../utils/jwt.util";
import {
  ORG_ADMIN_REFRESH_JWT_EXPIRES_IN,
  ORG_ADMIN_REFRESH_TTL_MS,
  setOrgAdminSessionCookies,
} from "../../utils/orgAdminSession.util";
import { z } from "zod";

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

export const adminLoginStep2 = async (req: Request, res: Response) => {
  try {
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }
    const { otp } = parsed.data;

    const tempToken = req.cookies?.admin_temp_token;
    if (!tempToken) {
      return res
        .status(401)
        .json({ message: "OTP session expired. Please login again." });
    }

    const { decoded, valid, error } = verifyToken(tempToken);
    if (!valid) {
      return res.status(401).json({
        message:
          error === "TokenExpiredError" ? "Session expired." : "Invalid session.",
      });
    }

    const userId = (decoded as any).userId;

    const [record, user] = await Promise.all([
      prisma.adminOtp.findUnique({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        include: { role: true, org: true },
      }),
    ]);

    if (!record || !user) {
      return res
        .status(400)
        .json({ message: "Invalid OTP session or user no longer exists" });
    }

    if (!user.isActive) {
      await prisma.adminOtp.delete({ where: { userId } });
      return res
        .status(403)
        .json({ message: "This admin account has been deactivated. Please contact support." });
    }

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

    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.adminOtp.update({
        where: { userId },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await prisma.adminOtp.delete({ where: { userId } });
    res.clearCookie("admin_temp_token");

    const accessToken = signAccessToken({
      sub: userId,
      role: user.role.name,
      orgId: user.orgId ?? undefined,
      orgStatus: user.org?.status ?? undefined,
    });

    const refreshToken = signRefreshToken({ sub: userId }, ORG_ADMIN_REFRESH_JWT_EXPIRES_IN);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ORG_ADMIN_REFRESH_TTL_MS),
      },
    });

    setOrgAdminSessionCookies(
      res,
      { accessToken, refreshToken, orgStatus: user.org?.status ?? undefined },
      ORG_ADMIN_REFRESH_TTL_MS,
    );

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: userId,
        role: user.role.name,
        orgStatus: user.org?.status,
      },
    });
  } catch (err) {
    console.error("[adminLoginStep2] Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
