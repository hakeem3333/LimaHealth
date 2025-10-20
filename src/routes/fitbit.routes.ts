// src/routes/fitbit.routes.ts

import { Router, Request, Response } from "express";
import {
  getAuthorizationUrl,
  getAccessToken,
  getAllDailyBiometrics,
  saveBiometricData,
} from "../services/fitbit.service"; // Ensure this path is correct
import { prisma } from "../prisma"; // Assuming your prisma client is exported here

// Create a new router instance
const router = Router();

// Middleware to ensure user is authenticated (required for linking)
// NOTE: You would need to ensure you have a standard authentication middleware
// that attaches the user object (with the 'id' property) to req.user.
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  // This is a placeholder for your actual authentication check
  // For now, we'll assume a user ID is available or use a mock/test ID
  if (!req.session?.userId) {
    // In a real app, this should redirect or return a 401
    return res
      .status(401)
      .send({ error: "Authentication required to link Fitbit." });
  }
  next();
};

// Route 1: Initiates the Fitbit OAuth flow
// GET /fitbit/auth
router.get("/auth", ensureAuthenticated, (req: Request, res: Response) => {
  try {
    const authUrl = getAuthorizationUrl();
    // Redirect the user to the Fitbit authorization page
    return res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating authorization URL:", error);
    return res
      .status(500)
      .send({ error: "Failed to start Fitbit authorization." });
  }
});

// Route 2: Handles the callback after successful Fitbit authorization
// GET /fitbit/callback
router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  // Check for authorization error
  if (error) {
    console.error("Fitbit authorization error:", error);
    // Redirect to a user-facing error page
    return res.redirect("/settings?error=fitbit_auth_denied");
  }

  // Check if code is present and user is logged in
  const userId = req.session?.userId; // Assuming userId is stored in session after login
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
});

// Route 3: Example route to manually trigger data fetch and save
// POST /fitbit/sync
router.post(
  "/sync",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    const userId = req.session?.userId; // Get user ID from session

    if (!userId) {
      return res.status(401).send({ error: "User not identified." });
    }

    try {
      // 1. Fetch credentials from the database
      const credentials = await prisma.fitbitCredential.findUnique({
        where: { userId: userId },
      });

      if (!credentials) {
        return res
          .status(404)
          .send({ error: "Fitbit not linked for this user." });
      }

      // TODO: Implement token refresh logic here if the token is expired (check credentials.expiresAt)
      let accessToken = credentials.accessToken;

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
  }
);

export default router;
