import type { AuthRequest } from "../middleware/auth.middleware.js";
import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";
import {
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  getAllDailyBiometrics,
  saveBiometricData,
} from "../services/fitbit.service.js";
import { z } from "zod";

const APP_SCHEME = process.env.FRONTEND_URL || "http://localhost:8081";

const fitbitCallbackSchema = z.object({
  code:  z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /fitbit/auth?userId=...
// Redirects the user to Fitbit's OAuth consent screen
// ---------------------------------------------------------------------------
export const authorizeFitbit = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId is required to link Fitbit." });
    }
    const authUrl = getAuthorizationUrl(String(userId));
    return res.redirect(authUrl);
  } catch (err) {
    console.error("Error generating Fitbit auth URL:", err);
    return res.status(500).json({ error: "Failed to start Fitbit authorization." });
  }
};

// ---------------------------------------------------------------------------
// GET /fitbit/callback
// Fitbit redirects here after user approves access
// ---------------------------------------------------------------------------
export const handleFitbitCallback = async (req: Request, res: Response) => {
  const parsed = fitbitCallbackSchema.safeParse(req.query);
  const redirect = (path: string) => res.redirect(`${APP_SCHEME}${path}`);

  if (!parsed.success) return redirect("/home?error=invalid_params");

  const { code, error, state: userId } = parsed.data;
  if (error) return redirect("/home?error=auth_denied");
  if (!code || !userId) return redirect("/home?error=missing_data");

  try {
    const tokenData = await getAccessToken(code);
    const { access_token, refresh_token, expires_in, user_id: fitbitUserId, scope, token_type } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Prevent linking one Fitbit account to multiple users
    const existingLink = await prisma.fitbitCredential.findUnique({ where: { fitbitUserId } });
    if (existingLink && existingLink.userId !== userId) {
      return redirect("/home?error=fitbit_already_linked_to_other");
    }

    await prisma.fitbitCredential.upsert({
      where: { userId },
      update: { accessToken: access_token, refreshToken: refresh_token, expiresAt, fitbitUserId, scope, tokenType: token_type },
      create: { userId, accessToken: access_token, refreshToken: refresh_token, expiresAt, fitbitUserId, scope, tokenType: token_type },
    });

    return redirect("/home?success=fitbit_linked");
  } catch (err: any) {
    console.error("Fitbit token exchange error:", err);
    if (err.code === "P2002") return redirect("/home?error=fitbit_id_conflict");
    return redirect("/home?error=token_exchange_failed");
  }
};

// ---------------------------------------------------------------------------
// GET /fitbit/status/:userId
// Returns whether the user has linked their Fitbit
// ---------------------------------------------------------------------------
export const getFitbitStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required." });

    const credential = await prisma.fitbitCredential.findUnique({ where: { userId } });
    return res.status(200).json({ isLinked: !!credential, userId });
  } catch (err) {
    console.error("Fitbit status error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ---------------------------------------------------------------------------
// POST /fitbit/sync
// Fetches today's Fitbit data and stores it as a biometric log
// ---------------------------------------------------------------------------
export const syncFitbitData = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let credentials = await prisma.fitbitCredential.findUnique({ where: { userId } });
    if (!credentials) return res.status(404).json({ error: "Fitbit not linked." });

    // Auto-refresh token if expiring within 5 minutes
    if (credentials.expiresAt.getTime() < Date.now() + 300_000) {
      const newTokens = await refreshAccessToken(credentials.refreshToken);
      const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
      credentials = await prisma.fitbitCredential.update({
        where: { userId },
        data: {
          accessToken:  newTokens.access_token,
          refreshToken: newTokens.refresh_token || credentials.refreshToken,
          expiresAt,
        },
      });
    }

    const biometricData = await getAllDailyBiometrics(credentials.accessToken);
    const newLog = await saveBiometricData(userId, biometricData);

    return res.status(200).json({ message: "Data synced successfully.", data: newLog });
  } catch (err: any) {
    console.error("Fitbit sync error:", err);
    return res.status(500).json({ error: "Sync failed", details: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /fitbit/data/:userId
// Returns the most recent biometric log for the home screen
// ---------------------------------------------------------------------------
export const getFitbitData = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId is required." });

    const log = await prisma.biometricLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!log) {
      return res.status(200).json({
        heartRate: 0, steps: 0, calories: 0, sleep: 0, stressLevel: 0,
        heartRateSeries: [],
      });
    }

    return res.status(200).json({
      heartRate:   log.heartRate,
      steps:       log.steps,
      calories:    log.calories,
      sleep:       log.sleepHours,
      stressLevel: log.stressLevelScore,
      gsr:         log.gsr,
      skinTemp:    log.skinTemp,
      movement:    log.movement,
      heartRateSeries: [], // populated when intraday HR data is available
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
