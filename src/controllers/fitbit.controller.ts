// src/controllers/fitbit.controller.ts
import type { Request, Response } from "express";
// Assuming src/controllers/ -> ../prisma.service.ts
import prisma from "../services/prisma.service";
import {
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  getAllDailyBiometrics,
  saveBiometricData,
} from "../services/fitbit.service"; // Assuming src/controllers/ -> ../services/fitbit.service.ts

/**
 * Controller to initiate the Fitbit OAuth 2.0 authorization flow.
 * Redirects the user to the Fitbit login and authorization page.
 */
export const authorizeFitbit = async (req: Request, res: Response) => {
  try {
    const authUrl = getAuthorizationUrl();
    // Redirect the user to the Fitbit authorization page
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating authorization URL:", error);
    res.status(500).send({ error: "Failed to start Fitbit authorization." });
  }
};

/**
 * Controller to handle the OAuth 2.0 callback from Fitbit.
 * Exchanges the authorization code for an access token and saves credentials to the database.
 */
export const handleFitbitCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  // Check for authorization error
  if (error) {
    console.error("Fitbit authorization error:", error);
    // Redirect to a user-facing error page
    return res.redirect("/settings?error=fitbit_auth_denied");
  }

  // Check if code is present and user is logged in
  const userId = (req as any).session?.userId; // Assuming userId is stored in session after login
  if (!code || !userId) {
    return res.redirect("/settings?error=missing_auth_code_or_user");
  }

  try {
    // 1. Exchange the code for the access token bundle
    const tokenData = await getAccessToken(code);
    const {
      access_token,
      refresh_token,
      expires_in,
      user_id,
      scope,
      token_type,
    } = tokenData;

    // Calculate token expiration time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // 2. Save the tokens and Fitbit ID to the database (FitbitCredential table)
    await prisma.fitbitCredential.upsert({
      where: { userId: userId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiresAt,
        fitbitUserId: user_id,
        scope: scope,
        tokenType: token_type,
      },
      create: {
        userId: userId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiresAt,
        fitbitUserId: user_id,
        scope: scope,
        tokenType: token_type,
      },
    });

    // Redirect to settings page with success message
    return res.redirect("/settings?success=fitbit_linked");
  } catch (err) {
    console.error("Error during Fitbit token exchange:", err);
    return res.redirect("/settings?error=token_exchange_failed");
  }
};

/**
 * Controller to manually trigger data fetch and save from Fitbit.
 * Handles token refresh if expired.
 */
export const syncFitbitData = async (req: Request, res: Response) => {
  const userId = (req as any).session?.userId; // Get user ID from session

  if (!userId) {
    return res.status(401).send({ error: "User not identified." });
  }

  try {
    // 1. Fetch credentials from the database
    let credentials = await prisma.fitbitCredential.findUnique({
      where: { userId: userId },
    });

    if (!credentials) {
      return res
        .status(404)
        .send({ error: "Fitbit not linked for this user." });
    }

    let accessToken = credentials.accessToken;

    // Check if token is expired (giving a 5-minute buffer) and refresh if necessary
    const now = Date.now();
    if (
      credentials.expiresAt &&
      credentials.expiresAt.getTime() < now + 300000
    ) {
      console.log("Refreshing expired Fitbit access token...");
      const newTokens = await refreshAccessToken(credentials.refreshToken);

      // Update credentials in the database
      const expiresAt = new Date(now + newTokens.expires_in * 1000);
      credentials = await prisma.fitbitCredential.update({
        where: { userId: userId },
        data: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || credentials.refreshToken,
          expiresAt: expiresAt,
        },
      });
      accessToken = credentials.accessToken;
      console.log("Token successfully refreshed.");
    }

    // 2. Fetch all daily biometric data from Fitbit
    const biometricData = await getAllDailyBiometrics(accessToken);

    // 3. Save the combined data to the BiometricLog table
    const newLog = await saveBiometricData(userId, biometricData);

    return res.status(200).send({
      message: "Biometric data synced and saved successfully.",
      data: newLog,
    });
  } catch (error) {
    console.error("Error during Fitbit sync:", error);
    return res
      .status(500)
      .send({ error: "Failed to sync Fitbit data.", details: error.message });
  }
};
