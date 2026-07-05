import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "../utils/jwt.util";

export const handleRefreshToken = async (req: Request, res: Response) => {
  // Mobile clients send the token in the body; web clients use HttpOnly cookies
  const isMobile = req.headers["x-client"] === "mobile";
  const oldRefreshToken = isMobile
    ? req.body?.refreshToken
    : req.cookies.refresh_token;

  if (!oldRefreshToken) {
    return res.status(401).json({ message: "Refresh token missing" });
  }

  const { decoded, valid } = verifyToken(oldRefreshToken);

  // Look up by hashed token
  const savedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(oldRefreshToken) },
    include: {
      user: {
        include: {
          role: true,
          org: true,
        },
      },
    },
  });

  // SECURITY: Reuse detection — valid token not in DB means it was already rotated
  if (!savedToken) {
    if (valid && decoded) {
      const userId = (decoded as any).sub;
      await prisma.refreshToken.deleteMany({ where: { userId } });
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res.status(403).json({
        message: "Security alert: Session compromised. Please login again.",
      });
    }
    return res.status(403).json({ message: "Invalid refresh session" });
  }

  // Token exists in DB but is expired
  if (!valid) {
    await prisma.refreshToken.delete({ where: { id: savedToken.id } });
    return res
      .status(403)
      .json({ message: "Session expired. Please login again." });
  }

  const userId = savedToken.userId;
  const roleName = savedToken.user.role?.name ?? "";
  const orgStatus = savedToken.user.org?.status ?? undefined;

  // Rotate: generate new token pair
  const newAccessToken = signAccessToken({
    sub: userId,
    role: roleName,
    orgId: savedToken.user.orgId ?? undefined,
    orgStatus,
  });
  const newRefreshToken = signRefreshToken({ sub: userId });

  // Replace old hash with new hash
  await prisma.refreshToken.update({
    where: { id: savedToken.id },
    data: { tokenHash: hashToken(newRefreshToken) },
  });

  const isProd = process.env.NODE_ENV === "production";

  if (isMobile) {
    // Mobile: return tokens in body — no cookies
    return res.status(200).json({
      message: "Tokens refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  }

  res.cookie("access_token", newAccessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({ message: "Tokens refreshed successfully" });
};
