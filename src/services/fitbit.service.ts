import fetch from "node-fetch";
import dotenv from "dotenv";
import prisma from "./prisma.service";

dotenv.config();

const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } =
  process.env;

const BASE_URL = "https://api.fitbit.com/1/user/-";
const AUTH_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";

/**
 * Generates the URL for Fitbit OAuth 2.0 authorization.
 * Now accepts 'state' (userId) to persist user identity through the redirect.
 */
export const getAuthorizationUrl = (state) => {
  const scope = "activity%20heartrate%20sleep%20profile";
  // We add &state=${state} so Fitbit sends the userId back in the callback
  return `${AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&scope=${scope}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&state=${state}`;
};

/**
 * Exchanges the authorization code for an access token.
 */
export const getAccessToken = async (code) => {
  const basicAuth = Buffer.from(
    `${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: FITBIT_REDIRECT_URI,
      code: code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get access token: ${response.statusText}, Details: ${errorText}`,
    );
  }

  return response.json();
};

/**
 * Refreshes an expired access token.
 */
export const refreshAccessToken = async (refreshToken) => {
  const basicAuth = Buffer.from(
    `${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`,
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
      `Failed to refresh access token: ${response.statusText}, Details: ${errorText}`,
    );
  }

  return response.json();
};

/**
 * Helper to fetch data from specific Fitbit API paths.
 */
const fetchFitbitData = async (accessToken, path) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch data from ${path}: ${response.statusText}, Details: ${errorText}`,
    );
  }

  return response.json();
};

/**
 * Concurrently fetches Activity, Heart Rate, and Sleep data.
 */
export const getAllDailyBiometrics = async (accessToken) => {
  const [activity, heart, sleep] = await Promise.all([
    fetchFitbitData(accessToken, "/activities/date/today.json"),
    fetchFitbitData(accessToken, "/activities/heart/date/today/1d.json"),
    fetchFitbitData(accessToken, "/sleep/date/today.json"),
  ]);

  return { activity, heart, sleep };
};

/**
//   const { summary } = data.activity;
//   const steps = summary?.steps || 0;
//   const caloriesOut = summary?.caloriesOut || 0;

//   const heartRate =
//     data.heart?.["activities-heart"]?.[0]?.value?.restingHeartRate || null;

//   const sleepLog = data.sleep?.sleep?.[0];
//   const sleepDuration =
//     sleepLog?.timeInBed || sleepLog?.totalMinutesAsleep || 0;

//   try {
//     const biometricLog = await prisma.biometricLog.create({
//       data: {
//         userId,
//         heartRate,
//         steps,
//         caloriesBurned: caloriesOut,
//         sleepDuration,
//       },
//     });
//     return biometricLog;
//   } catch (error) {
//     console.error("Error saving biometric data:", error);
//     throw new Error("Failed to save biometric data.");
//   }
// };

/**
 * Saves processed biometric data to Prisma.
 * Updated to match the mandatory fields in the BiometricLog schema.
 */
export const saveBiometricData = async (userId, data) => {
  const { summary } = data.activity;
  const steps = summary?.steps || 0;
  const caloriesOut = summary?.caloriesOut || 0;

  const heartRate =
    data.heart?.["activities-heart"]?.[0]?.value?.restingHeartRate || 0;

  const sleepLog = data.sleep?.sleep?.[0];
  const sleepDuration =
    sleepLog?.timeInBed || sleepLog?.totalMinutesAsleep || 0;

  // --- DERIVED FIELDS ---
  // Since the schema requires these Float fields, we provide defaults or logic
  const skinTemp = 0.0; // Fitbit requires higher-tier API permissions for skin temp
  const gsr = 0.0;      // Galvanic Skin Response
  const movement = steps > 0 ? (steps / 100) : 0.0; // Crude movement proxy

  // Basic Stress Logic: If HR is above 80 (resting), increase stress score
  const stressLevelScore = heartRate > 80 ? 7.5 : 3.2;

  try {
    const biometricLog = await prisma.biometricLog.create({
      data: {
        userId,
        heartRate: parseFloat(heartRate),
        steps: parseFloat(steps),
        caloriesBurned: parseFloat(caloriesOut),
        sleepDuration: parseFloat(sleepDuration),
        skinTemp: parseFloat(skinTemp),
        gsr: parseFloat(gsr),
        movement: parseFloat(movement),
        stressLevelScore: parseFloat(stressLevelScore),
      },
    });
    return biometricLog;
  } catch (error) {
    console.error("Error saving biometric data:", error);
    throw new Error("Failed to save biometric data to database.");
  }
};