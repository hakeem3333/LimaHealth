import type { AuthRequest } from "../middleware/auth.middleware.js";
import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";
import {
  getAuthorizationUrl,
  getAccessToken,
  consumeState,
  isAllowedAppRedirect,
  missingScopes,
  syncFitbitForUser,
} from "../services/fitbit.service.js";
import { getOrgThresholds } from "../utils/orgThresholds.util.js";
import { z } from "zod";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8081";

const fitbitCallbackSchema = z.object({
  code:  z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const withQuery = (url: string, query: string) => `${url}${url.includes("?") ? "&" : "?"}${query}`;

// Users may only read or change their own Fitbit data.
const isSelf = (req: AuthRequest) => req.user?.id === req.params.userId;

// ---------------------------------------------------------------------------
// GET /fitbit/auth-url?redirect=<app url>
// Returns the Google consent URL for the logged-in user. The app opens it in
// a browser; after consent, Google → /callback → back to `redirect`.
// ---------------------------------------------------------------------------
export const getFitbitAuthUrl = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const redirect = typeof req.query.redirect === "string" ? req.query.redirect : `${FRONTEND_URL}/home`;
  if (!isAllowedAppRedirect(redirect)) {
    return res.status(400).json({ error: "Redirect URL is not allowed." });
  }

  return res.status(200).json({ url: getAuthorizationUrl(userId, redirect) });
};

// ---------------------------------------------------------------------------
// GET /fitbit/callback
// Google redirects here after the user approves access
// ---------------------------------------------------------------------------
export const handleFitbitCallback = async (req: Request, res: Response) => {
  const parsed = fitbitCallbackSchema.safeParse(req.query);
  const linkState = consumeState(parsed.success ? parsed.data.state : undefined);
  const appRedirect = linkState?.appRedirect ?? `${FRONTEND_URL}/home`;
  const redirect = (query: string) => res.redirect(withQuery(appRedirect, query));

  if (!parsed.success) return redirect("error=invalid_params");
  if (!linkState) return redirect("error=invalid_state");

  const { code, error } = parsed.data;
  const { userId } = linkState;
  if (error) return redirect("error=auth_denied");
  if (!code) return redirect("error=missing_data");

  try {
    const tokenData = await getAccessToken(code);
    // fitbitUserId holds the Google Health user id (`healthUserId`).
    const { access_token, refresh_token, expires_in, healthUserId: fitbitUserId, scope, token_type } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // The user can untick scopes on Google's consent screen; a partial grant
    // would sync zeros forever, so make them link again with everything ticked.
    if (missingScopes(scope).length) {
      return redirect("error=missing_permissions");
    }

    // Prevent linking one Fitbit account to multiple users
    const existingLink = await prisma.fitbitCredential.findUnique({ where: { fitbitUserId } });
    if (existingLink && existingLink.userId !== userId) {
      return redirect("error=fitbit_already_linked_to_other");
    }

    // Google only sends a refresh token on a fresh consent; without one we
    // couldn't sync after the first hour.
    const refreshToken = refresh_token ?? (existingLink?.userId === userId ? existingLink.refreshToken : undefined);
    if (!refreshToken) {
      console.error("[Fitbit] Google returned no refresh token for user", userId);
      return redirect("error=token_exchange_failed");
    }

    const fields = {
      accessToken: access_token, refreshToken, expiresAt, fitbitUserId,
      scope: scope ?? null, tokenType: token_type ?? null,
    };
    await prisma.fitbitCredential.upsert({
      where: { userId },
      update: fields,
      create: { userId, ...fields },
    });

    // First pull right away so the app has real numbers when it lands.
    syncFitbitForUser(userId, { force: true }).catch((err) =>
      console.error("[Fitbit] Initial sync failed:", err.message),
    );

    return redirect("success=fitbit_linked");
  } catch (err: any) {
    console.error("Fitbit token exchange error:", err);
    if (err.code === "P2002") return redirect("error=fitbit_id_conflict");
    return redirect("error=token_exchange_failed");
  }
};

// ---------------------------------------------------------------------------
// GET /fitbit/status/:userId
// Returns whether the user has linked their Fitbit
// ---------------------------------------------------------------------------
export const getFitbitStatus = async (req: AuthRequest, res: Response) => {
  if (!isSelf(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const credential = await prisma.fitbitCredential.findUnique({ where: { userId: req.params.userId as string } });
    return res.status(200).json({ isLinked: !!credential, userId: req.params.userId });
  } catch (err) {
    console.error("Fitbit status error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ---------------------------------------------------------------------------
// POST /fitbit/sync?force=true
// Pulls today's Fitbit data and stores it as a biometric log. Throttled per
// user; `force` (pull-to-refresh) uses a shorter throttle window.
// ---------------------------------------------------------------------------
export const syncFitbitData = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await syncFitbitForUser(userId, { force: req.query.force === "true" });
    switch (result.status) {
      case "not_linked":
        return res.status(404).json({ error: "Fitbit not linked." });
      case "unlinked":
        return res.status(409).json({ error: "Fitbit access was revoked. Please reconnect.", isLinked: false });
      case "skipped":
        return res.status(200).json({ synced: false, lastSyncedAt: result.lastSyncedAt });
      case "synced":
        return res.status(200).json({ synced: true, lastSyncedAt: result.log.createdAt, data: result.log });
    }
  } catch (err: any) {
    console.error("Fitbit sync error:", err);
    return res.status(502).json({ error: "Sync failed", details: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /fitbit/data/:userId
// Returns the most recent biometric log for the home screen
// ---------------------------------------------------------------------------
export const getFitbitData = async (req: AuthRequest, res: Response) => {
  if (!isSelf(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const userId = req.params.userId as string;

    const [log, { sleepTarget }] = await Promise.all([
      prisma.biometricLog.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      // The org's "Minimum Sleep Target", shown as the sleep goal in the app
      getOrgThresholds(req.user?.orgId),
    ]);

    if (!log) {
      return res.status(200).json({
        heartRate: 0, steps: 0, calories: 0, sleep: 0, stressLevel: 0,
        heartRateSeries: [], syncedAt: null, sleepTarget,
      });
    }

    // Chart points for the home screen: the last dozen readings, oldest first.
    // Only every third point carries an x-axis label so the axis stays readable.
    const recentLogs = await prisma.biometricLog.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: 12,
      select: { heartRate: true, timestamp: true },
    });
    const heartRateSeries = recentLogs.reverse().map((l, i) => ({
      value: l.heartRate,
      label: i % 3 === 0
        ? l.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "",
    }));

    return res.status(200).json({
      heartRate:   log.heartRate,
      steps:       log.steps,
      calories:    log.calories,
      sleep:       log.sleepHours,
      stressLevel: log.stressLevelScore,
      gsr:         log.gsr,
      skinTemp:    log.skinTemp,
      movement:    log.movement,
      syncedAt:    log.createdAt,
      sleepTarget,
      heartRateSeries,
    });
  } catch (err) {
    console.error("Fitbit data error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ---------------------------------------------------------------------------
// DELETE /fitbit/disconnect
// Removes the Fitbit link for the authenticated user
// ---------------------------------------------------------------------------
export const disconnectFitbit = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await prisma.fitbitCredential.delete({ where: { userId } });
    return res.status(200).json({ message: "Fitbit account disconnected." });
  } catch (err: any) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "No Fitbit account linked." });
    }
    console.error("Fitbit disconnect error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};
