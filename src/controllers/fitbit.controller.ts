import prisma from "../services/prisma.service";

import {
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  getAllDailyBiometrics,
  saveBiometricData,
} from "../services/fitbit.service";
import { z } from "zod";

const fitbitCallbackSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(), // The userId returned by Fitbit
});

/**
 * Starts the flow.
 * Mobile should call: GET /auth/fitbit?userId=XYZ
 */
export const authorizeFitbit = async (req, res) => {
  try {
    const { userId } = req.query; // Mobile app passes this in the URL

    if (!userId) {
      return res
        .status(400)
        .send({ error: "userId is required to link Fitbit." });
    }

    // We pass userId as 'state' so it persists through the redirect
    const authUrl = getAuthorizationUrl(userId);
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating authorization URL:", error);
    res.status(500).send({ error: "Failed to start Fitbit authorization." });
  }
};

/**
 * Fitbit redirects here after user login
 */
export const handleFitbitCallback = async (req, res) => {
  const parsed = fitbitCallbackSchema.safeParse(req.query);

  // Mobile Deep Link Base
  // For the Mobile App:
  // const APP_SCHEME = "limahealth://home";

  // For Web Testing:
  const APP_SCHEME = "localhost:8081://home";

  if (!parsed.success) {
    return res.redirect(`${APP_SCHEME}?error=invalid_params`);
  }

  const { code, error, state: userId } = parsed.data;

  if (error) {
    console.error("Fitbit authorization error:", error);
    return res.redirect(`${APP_SCHEME}?error=auth_denied`);
  }

  if (!code || !userId) {
    return res.redirect(`${APP_SCHEME}?error=missing_data`);
  }

  try {
    const tokenData = await getAccessToken(code);
    const {
      access_token,
      refresh_token,
      expires_in,
      user_id: fitbitUserId,
      scope,
      token_type,
    } = tokenData;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Save tokens using the userId we recovered from 'state'
    await prisma.fitbitCredential.upsert({
      where: { userId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        fitbitUserId,
        scope,
        tokenType: token_type,
      },
      create: {
        userId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        fitbitUserId,
        scope,
        tokenType: token_type,
      },
    });

    // Successful redirect back to mobile app
    return res.redirect(`${APP_SCHEME}?success=fitbit_linked`);
  } catch (err) {
    console.error("Error during Fitbit token exchange:", err);
    return res.redirect(`${APP_SCHEME}?error=token_exchange_failed`);
  }
};

export const syncFitbitData = async (req, res) => {
  const userId = req.user?.id; // Assuming JWT middleware is used
  if (!userId) return res.status(401).send({ error: "Unauthorized" });

  try {
    let credentials = await prisma.fitbitCredential.findUnique({
      where: { userId },
    });

    if (!credentials) {
      return res.status(404).send({ error: "Fitbit not linked." });
    }

    let accessToken = credentials.accessToken;
    const now = Date.now();

    // Auto-refresh logic
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
      message: "Data synced successfully.",
      data: newLog,
    });
  } catch (error) {
    console.error("Error during Fitbit sync:", error);
    return res
      .status(500)
      .send({ error: "Sync failed", details: error.message });
  }
};
