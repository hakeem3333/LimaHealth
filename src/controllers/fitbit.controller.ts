import { Request, Response } from "express";
import {
  getAuthorizationUrl,
  getAccessToken,
  getDailyActivity,
} from "../services/fitbit.service";

/**
 * Controller to initiate the Fitbit OAuth 2.0 authorization flow.
 * Redirects the user to the Fitbit login and authorization page.
 */
export const authorizeFitbit = async (req: Request, res: Response) => {
  try {
    const authUrl = getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error during Fitbit authorization:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Controller to handle the OAuth 2.0 callback from Fitbit.
 * Exchanges the authorization code for an access token and refreshes the token.
 */
export const handleFitbitCallback = async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ message: "Authorization code not found." });
  }

  try {
    const tokens = await getAccessToken(code as string);

    // Save tokens securely in your database or session for the current user
    // For this example, we'll just log them to the console.
    // In a real app, you would associate these tokens with a specific user account.
    console.log("Fitbit Access Token:", tokens.access_token);
    console.log("Fitbit Refresh Token:", tokens.refresh_token);

    // After getting tokens, you can immediately fetch data
    const dailyActivityData = await getDailyActivity(tokens.access_token);
    console.log("Daily Activity Data:", dailyActivityData);

    res.status(200).json({
      message: "Fitbit authentication successful. Data fetched.",
      data: dailyActivityData,
    });
  } catch (error) {
    console.error("Error handling Fitbit callback:", error);
    res.status(500).json({ message: "Error retrieving access token or data." });
  }
};
