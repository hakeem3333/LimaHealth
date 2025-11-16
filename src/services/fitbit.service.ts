import fetch from "node-fetch";
import dotenv from "dotenv";
import prisma  from "./prisma.service"; // Assuming this is correct

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
  // Ensure all necessary scopes are included for all data types
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
 * Refreshes an expired access token using the refresh token.
 * @param refreshToken The refresh token for the user.
 * @returns A promise that resolves to the new access and refresh tokens.
 */
export const refreshAccessToken = async (
  refreshToken: string
): Promise<any> => {
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
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to refresh access token: ${response.statusText}, Details: ${errorText}`
    );
  }

  return response.json();
};

// --- NEW/UPDATED BIOMETRIC DATA FETCHING FUNCTIONS ---

/**
 * Helper to fetch data from a specific Fitbit API path.
 */
const fetchFitbitData = async (
  accessToken: string,
  path: string
): Promise<any> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch data from ${path}: ${response.statusText}, Details: ${errorText}`
    );
  }

  return response.json();
};

/**
 * Fetches daily activity data (steps, distance, calories).
 */
const fetchActivityData = (accessToken: string) => {
  // activities/date/today.json returns activities summary
  return fetchFitbitData(accessToken, "/activities/date/today.json");
};

/**
 * Fetches heart rate data for today.
 * The endpoint path is corrected to be a separate call.
 */
const fetchHeartRateData = (accessToken: string) => {
  // activities/heart/date/[date]/[detail-level].json
  return fetchFitbitData(accessToken, "/activities/heart/date/today/1d.json");
};

/**
 * Fetches sleep data for today.
 * The endpoint path is corrected to be a separate call.
 */
const fetchSleepData = (accessToken: string) => {
  // sleep/date/[date].json
  return fetchFitbitData(accessToken, "/sleep/date/today.json");
};

/**
 * Fetches ALL daily biometric data (Activity, Heart Rate, and Sleep) concurrently.
 * @param accessToken The access token for the user.
 * @returns A promise that resolves to an object containing all daily biometric data.
 */
export const getAllDailyBiometrics = async (
  accessToken: string
): Promise<any> => {
  const [activityData, heartRateData, sleepData] = await Promise.all([
    fetchActivityData(accessToken),
    fetchHeartRateData(accessToken),
    fetchSleepData(accessToken),
  ]);

  // Combine the results into a single object
  return {
    activity: activityData,
    heart: heartRateData,
    sleep: sleepData,
  };
};

/**
 * Saves biometric data from Fitbit to the database.
 * @param userId The ID of the user.
 * @param data The combined biometric data from getAllDailyBiometrics.
 * @returns A promise that resolves to the new BiometricLog record.
 */
export const saveBiometricData = async (
  userId: string,
  data: { activity: any; heart: any; sleep: any }
): Promise<any> => {
  // Safely extract Activity data
  const { summary } = data.activity;
  const steps = summary?.steps || 0;
  const caloriesOut = summary?.caloriesOut || 0;

  // Safely extract Heart Rate data (getting the resting heart rate for the day)
  const heartRate =
    data.heart?.["activities-heart"]?.[0]?.value?.restingHeartRate || null;

  // Safely extract Sleep data (getting total minutes asleep from the latest log)
  const sleepLog = data.sleep?.sleep?.[0]; // Assumes the first sleep entry is the most relevant
  const sleepDuration =
    sleepLog?.timeInBed || sleepLog?.totalMinutesAsleep || 0;

  try {
    const biometricLog = await prisma.biometricLog.create({
      data: {
        userId,
        heartRate: heartRate, // Nullable number (int)
        steps: steps, // Number (int)
        caloriesBurned: caloriesOut, // Number (int)
        sleepDuration: sleepDuration, // Number (int) (in minutes)
      },
    });
    return biometricLog;
  } catch (error) {
    console.error("Error saving biometric data to the database:", error);
    throw new Error("Failed to save biometric data.");
  }
};
