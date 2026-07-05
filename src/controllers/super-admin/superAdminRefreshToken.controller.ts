import type { Request, Response } from "express";
import prisma from "../../services/prisma.service";
import { hashToken, signAccessToken } from "../../utils/jwt.util";

export const superAdminRefreshToken = async (req: Request, res: Response) => {
  try {
    // 1. Get the namespaced refresh token
    const refreshToken = req.cookies?.super_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    // 2. Hash the incoming token to find it in the DB
    const incomingTokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: incomingTokenHash },
      include: { user: { include: { role: true } } },
    });

    // 3. Validate token existence, expiry, and revocation
    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date()
    ) {
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh session" });
    }

    // 4. Double check the user is actually a Super Admin
    if (storedToken.user.role.name !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    // 5. Generate NEW Access Token (super admins have no school)
    const newAccessToken = signAccessToken({
      sub: storedToken.userId,
      role: "SUPER_ADMIN",
    });

    // 6. Set the new cookie
    res.cookie("super_access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    return res.status(200).json({ message: "Token refreshed successfully" });
  } catch (err) {
    console.error("Super Admin Refresh Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
