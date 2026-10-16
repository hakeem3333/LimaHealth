import type { Request, Response } from "express";
import prisma from "../../services/prisma.service";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  REFRESH_GRACE_WINDOW_MS,
} from "../../utils/jwt.util";
import {
  SUPER_REFRESH_JWT_EXPIRES_IN,
  setSuperSessionCookies,
  clearSuperSessionCookies,
} from "../../utils/superAdminSession.util";

export const superAdminRefreshToken = async (req: Request, res: Response) => {
  try {
    // 1. Get the namespaced refresh token
    const oldRefreshToken = req.cookies?.super_refresh_token;

    if (!oldRefreshToken) {
      // Drop a stale super_session hint so the frontend middleware stops
      // letting pages load for a session that no longer exists.
      clearSuperSessionCookies(res);
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const { decoded, valid } = verifyToken(oldRefreshToken);
    const incomingTokenHash = hashToken(oldRefreshToken);

    // 2. Try the current hash first — the expected case.
    let storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: incomingTokenHash },
      include: { user: { include: { role: true } } },
    });

    // 3. Not the current hash — check whether it's the just-superseded one,
    // within the grace window. Absorbs a reload racing an in-flight refresh,
    // a duplicate effect firing twice, etc. without treating it as theft.
    let isGraceHit = false;
    if (!storedToken) {
      const graceCandidate = await prisma.refreshToken.findFirst({
        where: { previousTokenHash: incomingTokenHash },
        include: { user: { include: { role: true } } },
      });
      if (
        graceCandidate?.rotatedAt &&
        Date.now() - graceCandidate.rotatedAt.getTime() <= REFRESH_GRACE_WINDOW_MS
      ) {
        storedToken = graceCandidate;
        isGraceHit = true;
      }
    }

    // 4. SECURITY: Reuse detection — a structurally valid JWT that isn't the
    // current or recently-superseded hash means it was rotated out long ago
    // (or never existed). Treat as theft: kill every session for this user.
    if (!storedToken) {
      clearSuperSessionCookies(res);
      if (valid && decoded) {
        const userId = (decoded as any).sub;
        await prisma.refreshToken.deleteMany({ where: { userId } });
        return res.status(403).json({
          message: "Security alert: Session compromised. Please login again.",
        });
      }
      return res.status(403).json({ message: "Invalid refresh session" });
    }

    // 5. Token exists in DB but is expired, revoked, or the JWT itself expired
    if (!valid || storedToken.revoked || storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      clearSuperSessionCookies(res);
      return res
        .status(403)
        .json({ message: "Session expired. Please login again." });
    }

    // 6. Double check the user is actually a Super Admin
    if (storedToken.user.role.name !== "SUPER_ADMIN") {
      clearSuperSessionCookies(res);
      return res.status(403).json({ message: "Unauthorized role" });
    }

    const userId = storedToken.userId;
    // Cookies live only as long as the session's absolute expiry (1 day from login).
    const sessionMs = storedToken.expiresAt.getTime() - Date.now();

    // Grace-window hit: reissue only a fresh access token. We don't have the
    // plaintext of the *current* refresh token (only its hash) to hand back,
    // and re-rotating here would just move the race one generation further
    // out — so leave the refresh token alone entirely.
    if (isGraceHit) {
      const newAccessToken = signAccessToken({ sub: userId, role: "SUPER_ADMIN" });
      setSuperSessionCookies(res, { accessToken: newAccessToken }, sessionMs);
      return res.status(200).json({ message: "Access token refreshed" });
    }

    // 7. Normal path: rotate. Stash the outgoing hash + timestamp for the
    // grace window before overwriting it. Keeps the original session's
    // absolute expiresAt so rotation doesn't extend the session indefinitely.
    const newAccessToken = signAccessToken({ sub: userId, role: "SUPER_ADMIN" });
    const newRefreshToken = signRefreshToken({ sub: userId }, SUPER_REFRESH_JWT_EXPIRES_IN);

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        previousTokenHash: storedToken.tokenHash,
        rotatedAt: new Date(),
        tokenHash: hashToken(newRefreshToken),
      },
    });

    setSuperSessionCookies(
      res,
      { accessToken: newAccessToken, refreshToken: newRefreshToken },
      sessionMs,
    );

    return res.status(200).json({ message: "Token refreshed successfully" });
  } catch (err) {
    console.error("Super Admin Refresh Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
