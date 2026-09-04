import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  verifyToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
  REFRESH_GRACE_WINDOW_MS,
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
  const incomingHash = hashToken(oldRefreshToken);

  const userInclude = { role: true, org: true } as const;

  // 1. Try the current hash first — the expected case.
  let savedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: incomingHash },
    include: { user: { include: userInclude } },
  });

  // 2. Not the current hash — check whether it's the just-superseded one,
  // within the grace window. Absorbs a reload racing an in-flight refresh,
  // a duplicate effect firing twice, etc. without treating it as theft.
  let isGraceHit = false;
  if (!savedToken) {
    const graceCandidate = await prisma.refreshToken.findFirst({
      where: { previousTokenHash: incomingHash },
      include: { user: { include: userInclude } },
    });
    if (
      graceCandidate?.rotatedAt &&
      Date.now() - graceCandidate.rotatedAt.getTime() <= REFRESH_GRACE_WINDOW_MS
    ) {
      savedToken = graceCandidate;
      isGraceHit = true;
    }
  }

  // SECURITY: Reuse detection — a valid token not found as either the
  // current or recently-superseded hash means it was rotated out long ago
  // (or never existed). Treat as theft: kill every session for this user.
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

  // Token exists in DB but is expired, revoked, or the JWT itself expired
  if (!valid || savedToken.revoked || savedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: savedToken.id } });
    return res
      .status(403)
      .json({ message: "Session expired. Please login again." });
  }

  const userId = savedToken.userId;
  const roleName = savedToken.user.role?.name ?? "";
  const orgStatus = savedToken.user.org?.status ?? undefined;
  const isProd = process.env.NODE_ENV === "production";

  // Grace-window hit: reissue only a fresh access token. We don't have the
  // plaintext of the *current* refresh token (only its hash) to hand back,
  // and re-rotating here would just move the race one generation further
  // out — so leave the refresh token alone entirely.
  if (isGraceHit) {
    const newAccessToken = signAccessToken({
      sub: userId,
      role: roleName,
      orgId: savedToken.user.orgId ?? undefined,
      orgStatus,
    });

    if (isMobile) {
      return res.status(200).json({
        message: "Access token refreshed",
        accessToken: newAccessToken,
      });
    }

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({ message: "Access token refreshed" });
  }

  // Normal path: rotate. Stash the outgoing hash + timestamp for the grace
  // window before overwriting it.
  const newAccessToken = signAccessToken({
    sub: userId,
    role: roleName,
    orgId: savedToken.user.orgId ?? undefined,
    orgStatus,
  });
  const newRefreshToken = signRefreshToken({ sub: userId });

  await prisma.refreshToken.update({
    where: { id: savedToken.id },
    data: {
      previousTokenHash: savedToken.tokenHash,
      rotatedAt: new Date(),
      tokenHash: hashToken(newRefreshToken),
    },
  });

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

  // Keep the middleware-readable org_status cookie in sync with the DB —
  // otherwise a status change mid-session stays invisible to middleware
  // routing until the user logs out and back in.
  if (orgStatus) {
    res.cookie("org_status", orgStatus, {
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  res.cookie("refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({ message: "Tokens refreshed successfully" });
};
