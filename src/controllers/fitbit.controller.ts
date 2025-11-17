import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  getAllDailyBiometrics,
  saveBiometricData,
} from "../services/fitbit.service";
import { z } from "zod";

// Zod schemas
const fitbitCallbackSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

export const authorizeFitbit = async (req: Request, res: Response) => {
  try {
    const authUrl = getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating authorization URL:", error);
    res.status(500).send({ error: "Failed to start Fitbit authorization." });
  }
};

export const handleFitbitCallback = async (req: Request, res: Response) => {
  const parsed = fitbitCallbackSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.redirect("/settings?error=invalid_callback_params");
  }

  const { code, error } = parsed.data;

  if (error) {
    console.error("Fitbit authorization error:", error);
    return res.redirect("/settings?error=fitbit_auth_denied");
  }

  // ⬇⬇⬇ UPDATED FOR JWT (NOT sessions)
  const userId = (req as any).user?.id;
  if (!code || !userId) {
    return res.redirect("/settings?error=missing_auth_code_or_user");
  }

  try {
    const tokenData = await getAccessToken(code);
    const {
      access_token,
      refresh_token,
      expires_in,
      user_id,
      scope,
      token_type,
    } = tokenData;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await prisma.fitbitCredential.upsert({
      where: { userId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        fitbitUserId: user_id,
        scope,
        tokenType: token_type,
      },
      create: {
        userId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        fitbitUserId: user_id,
        scope,
        tokenType: token_type,
      },
    });

    return res.redirect("/settings?success=fitbit_linked");
  } catch (err) {
    console.error("Error during Fitbit token exchange:", err);
    return res.redirect("/settings?error=token_exchange_failed");
  }
};

export const syncFitbitData = async (req: Request, res: Response) => {
  // ⬇⬇⬇ UPDATED FOR JWT (NOT sessions)
  const userId = (req as any).user?.id;
  if (!userId)
    return res
      .status(401)
      .send({ error: "Unauthorized — no user found in token." });

  try {
    let credentials = await prisma.fitbitCredential.findUnique({
      where: { userId },
    });

    if (!credentials) {
      return res
        .status(404)
        .send({ error: "Fitbit not linked for this user." });
    }

    let accessToken = credentials.accessToken;
    const now = Date.now();

    // Refresh token if it expires in the next 5 min
    if (
      credentials.expiresAt &&
      credentials.expiresAt.getTime() < now + 300_000
    ) {
      const newTokens = await refreshAccessToken(credentials.refreshToken);
      const expiresAt = new Date(now + newTokens.expires_in * 1000);

      credentials = await prisma.fitbitCredential.update({
        where: { userId },
        data: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || credentials.refreshToken,
          expiresAt,
        },
      });

      accessToken = credentials.accessToken;
    }

    const biometricData = await getAllDailyBiometrics(accessToken);
    const newLog = await saveBiometricData(userId, biometricData);

    return res.status(200).send({
      message: "Biometric data synced and saved successfully.",
      data: newLog,
    });
  } catch (error: any) {
    console.error("Error during Fitbit sync:", error);
    return res.status(500).send({
      error: "Failed to sync Fitbit data.",
      details: error.message,
    });
  }
};
