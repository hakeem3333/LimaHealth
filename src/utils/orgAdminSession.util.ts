import type { Response } from "express";

/**
 * Org Admin (web) session cookies, shared by login (OTP verify), refresh and logout.
 *
 * - access_token:  15 min, sent on every path.
 * - refresh_token: 1 day (absolute, from login), scoped to /api/v1/auth.
 * - admin_session: "1", lives as long as the refresh session. Not a credential —
 *   only a hint so the admin frontend's Next.js middleware (which can't see the
 *   path-scoped refresh cookie) lets pages load after the access token expires,
 *   letting the axios 401 interceptor perform the refresh.
 * - org_status:    readable by the middleware for billing / pending routing.
 *
 * Mobile clients and other web roles (e.g. parents) keep the 7-day default.
 */
export const ORG_ADMIN_ACCESS_TTL_MS = 15 * 60 * 1000;
export const ORG_ADMIN_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const ORG_ADMIN_REFRESH_JWT_EXPIRES_IN = "1d";
export const AUTH_REFRESH_PATH = "/api/v1/auth";

const baseOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("strict" as const) : ("lax" as const),
  };
};

/** Sets the session cookies. `sessionMs` is the time left on the refresh session. */
export const setOrgAdminSessionCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken?: string; orgStatus?: string },
  sessionMs: number,
) => {
  res.cookie("access_token", tokens.accessToken, {
    ...baseOptions(),
    maxAge: ORG_ADMIN_ACCESS_TTL_MS,
  });

  if (tokens.refreshToken) {
    res.cookie("refresh_token", tokens.refreshToken, {
      ...baseOptions(),
      path: AUTH_REFRESH_PATH,
      maxAge: sessionMs,
    });
  }

  if (tokens.orgStatus) {
    res.cookie("org_status", tokens.orgStatus, {
      ...baseOptions(),
      httpOnly: false, // readable by frontend middleware
      sameSite: "lax",
      path: "/",
      maxAge: sessionMs,
    });
  }

  res.cookie("admin_session", "1", { ...baseOptions(), path: "/", maxAge: sessionMs });
};

/** Clears every web session cookie (any role) so a dead session can't linger. */
export const clearWebSessionCookies = (res: Response) => {
  res.clearCookie("access_token", { ...baseOptions(), path: "/" });
  res.clearCookie("refresh_token", { ...baseOptions(), path: AUTH_REFRESH_PATH });
  res.clearCookie("org_status", { ...baseOptions(), httpOnly: false, sameSite: "lax", path: "/" });
  res.clearCookie("admin_session", { ...baseOptions(), path: "/" });
};
