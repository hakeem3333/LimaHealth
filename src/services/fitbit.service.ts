import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } =
  process.env;

const BASE_URL = "https://api.fitbit.com/1/user/-";
const AUTH_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";

/**
 * Generates the URL for Fitbit OAuth 2.0 authorization.
 * The user is redirected to this URL to grant permissions.
 * @returns The Fitbit authorization URL.
 */
export const getAuthorizationUrl = (): string => {
  const scope = "activity%20heartrate%20sleep%20profile";
  return `${AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&scope=${scope}&redirect_uri=${FITBIT_REDIRECT_URI}`;
};

/**
 * Exchanges the authorization code for an access token.
 * This token is required to make API requests to Fitbit.
 * @param code The authorization code received from the Fitbit callback.
 * @returns An object containing the access and refresh tokens.
 */
export const getAccessToken = async (code: string): Promise<any> => {
  const basicAuth = Buffer.from(
    `${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: FITBIT_REDIRECT_URI!,
      code: code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get access token: ${response.statusText}, Details: ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetches daily activity data (e.g., steps, distance) from the Fitbit API.
 * @param accessToken The access token for the user.
 * @returns A promise that resolves to the daily activity data.
 */
export const getDailyActivity = async (accessToken: string): Promise<any> => {
  const response = await fetch(`${BASE_URL}/activities/date/today.json`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch daily activity: ${response.statusText}, Details: ${errorText}`
    );
  }

  return response.json();
};

// You can add more functions here for other data types (e.g., heart rate, sleep).
