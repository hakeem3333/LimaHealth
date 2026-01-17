import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
} from "../utils/jwt.util";

export const handleRefreshToken = async (req: Request, res: Response) => {
  const oldRefreshToken = req.cookies.refresh_token;

  if (!oldRefreshToken) {
    return res.status(401).json({ message: "Refresh token missing" });
  }

  // 1. Verify the token structure and expiry
  const { decoded, valid, error } = verifyToken(oldRefreshToken);

  // 2. Look for the token in the DB
  const savedToken = await prisma.refreshToken.findUnique({
    where: { token: oldRefreshToken },
    include: { user: true },
  });

  // SECURITY: REUSE DETECTION
  // If the token is valid but NOT in our DB, it means it was already used and deleted.
  // This suggests someone stole an old token. We must revoke ALL sessions for this user.
  if (!savedToken) {
    if (valid && decoded) {
      const userId = (decoded as any).sub;
      await prisma.refreshToken.deleteMany({ where: { userId } });
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res
        .status(403)
        .json({
          message: "Security alert: Session compromised. Please login again.",
        });
    }
    return res.status(403).json({ message: "Invalid refresh session" });
  }

  // 3. Check if the token is actually expired
  if (!valid) {
    await prisma.refreshToken.delete({ where: { id: savedToken.id } });
    return res
      .status(403)
      .json({ message: "Session expired. Please login again." });
  }

  const userId = savedToken.userId;

  // 4. Generate NEW pair (Rotation)
  const newAccessToken = signAccessToken({
    sub: userId,
    role: savedToken.user.roleId,
  });
  const newRefreshToken = signRefreshToken({ sub: userId });

  // 5. Update the DB: Replace old token with new one
  await prisma.refreshToken.update({
    where: { id: savedToken.id },
    data: { token: newRefreshToken },
  });

  // 6. Set new cookies
  res.cookie("access_token", newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth/refresh", // Limit scope for security
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({ message: "Tokens refreshed successfully" });
};
