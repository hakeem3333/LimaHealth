import type { Response } from "express";

/**
 * Super Admin session cookies, shared by login (OTP verify), refresh and logout.
 *
 * - super_access_token:  15 min, sent on every path.
 * - super_refresh_token: 1 day (absolute, from login), scoped to the refresh endpoint.
 * - super_session:       "1", lives as long as the refresh session. Not a credential —
 *   only a hint so the admin frontend's Next.js middleware (which can't see the
 *   path-scoped refresh cookie) lets pages load after the access token expires,
 *   letting the axios 401 interceptor perform the refresh.
 */
export const SUPER_ACCESS_TTL_MS = 15 * 60 * 1000;
export const SUPER_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const SUPER_REFRESH_JWT_EXPIRES_IN = "1d";
export const SUPER_REFRESH_PATH = "/api/v1/super-admin/refresh-token";

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
});

/** Sets all three cookies. `sessionMs` is the time left on the refresh session. */
export const setSuperSessionCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken?: string },
  sessionMs: number,
) => {
  res.cookie("super_access_token", tokens.accessToken, {
    ...baseOptions(),
    maxAge: SUPER_ACCESS_TTL_MS,
  });

  if (tokens.refreshToken) {
    res.cookie("super_refresh_token", tokens.refreshToken, {
      ...baseOptions(),
      path: SUPER_REFRESH_PATH,
      maxAge: sessionMs,
    });
  }

  res.cookie("super_session", "1", { ...baseOptions(), maxAge: sessionMs });
};

export const clearSuperSessionCookies = (res: Response) => {
  res.clearCookie("super_access_token", baseOptions());
  res.clearCookie("super_refresh_token", { ...baseOptions(), path: SUPER_REFRESH_PATH });
  res.clearCookie("super_session", baseOptions());
};
