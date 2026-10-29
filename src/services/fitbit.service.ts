import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "./prisma.service.js";
import { scoreAndEvaluate } from "./alertEngine.service.js";
import { isValidTimeZone, zonedParts } from "../utils/timezone.util.js";

dotenv.config();

// Fitbit data is read through the Google Health API (the successor to the
// Fitbit Web API, which Google turns off on 2026-10-30), with Google OAuth 2.0.
const {
  GOOGLE_HEALTH_CLIENT_ID,
  GOOGLE_HEALTH_CLIENT_SECRET,
  GOOGLE_HEALTH_REDIRECT_URI,
  GOOGLE_HEALTH_API_BASE_URL,
  GOOGLE_HEALTH_AUTH_URL,
  GOOGLE_HEALTH_TOKEN_URL,
} = process.env;

const BASE_URL = GOOGLE_HEALTH_API_BASE_URL || "https://health.googleapis.com/v4";
const AUTH_URL = GOOGLE_HEALTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = GOOGLE_HEALTH_TOKEN_URL || "https://oauth2.googleapis.com/token";

const SCOPE_PREFIX = "https://www.googleapis.com/auth/googlehealth.";
// Google's consent screen lets users untick individual scopes, so the
// callback checks that every one of these was actually granted.
export const REQUIRED_SCOPES = [
  "activity_and_fitness.readonly",          // steps, calories
  "health_metrics_and_measurements.readonly", // resting heart rate, HRV
  "sleep.readonly",
  "settings.readonly",                      // time zone
].map((s) => SCOPE_PREFIX + s);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8081";

// Background sync cadence, and the minimum gap between two syncs for the same
// user. Each sync costs 5 API requests (plus one settings call per process).
const SYNC_INTERVAL_MS = Number(process.env.FITBIT_SYNC_INTERVAL_MINUTES || 30) * 60_000;
const MIN_SYNC_GAP_MS = 15 * 60_000;       // scheduler / normal app open
const MIN_FORCED_SYNC_GAP_MS = 60_000;     // pull-to-refresh

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string; // only on the first grant / with prompt=consent; refreshes reuse the old one
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export class FitbitAuthError extends Error {}

// ---------------------------------------------------------------------------
// OAuth state — signed, short-lived and single-use, so a callback can only
// link the Fitbit account to the user who started the flow.
// ---------------------------------------------------------------------------

const STATE_PURPOSE = "FITBIT_LINK";
const usedStateNonces = new Map<string, number>(); // nonce -> expiry (ms)

// App return URLs we are willing to redirect to after the OAuth callback:
// the native app scheme, Expo Go during development, and the web frontend.
// Web URLs are compared by origin, not prefix, so look-alikes such as
// "https://app.example.com.evil.com" or "https://app.example.com@evil.com" fail.
export const isAllowedAppRedirect = (url: string) => {
  if (url.startsWith("limahealth://") || url.startsWith("exp://") || url.startsWith("exps://")) return true;
  try {
    return new URL(url).origin === new URL(FRONTEND_URL).origin;
  } catch {
    return false;
  }
};

type StatePayload = { userId: string; redirect: string; nonce: string; purpose: string; exp: number };

const createState = (userId: string, appRedirect: string) =>
  jwt.sign(
    { userId, redirect: appRedirect, nonce: crypto.randomUUID(), purpose: STATE_PURPOSE },
    process.env.JWT_SECRET as string,
    { expiresIn: "10m" },
  );

/**
 * Validates the OAuth state and marks it as used.
 * Returns null when the state is missing, forged, expired or replayed.
 */
export const consumeState = (state: string | undefined) => {
  if (!state) return null;
  let payload: StatePayload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET as string) as StatePayload;
  } catch {
    return null;
  }
  if (payload.purpose !== STATE_PURPOSE || !payload.userId || !payload.nonce) return null;

  const now = Date.now();
  for (const [nonce, exp] of usedStateNonces) if (exp < now) usedStateNonces.delete(nonce);
  if (usedStateNonces.has(payload.nonce)) return null;
  usedStateNonces.set(payload.nonce, payload.exp * 1000);

  const appRedirect = isAllowedAppRedirect(payload.redirect) ? payload.redirect : `${FRONTEND_URL}/home`;
  return { userId: payload.userId, appRedirect };
};

/**
 * Generates the Google OAuth 2.0 consent URL for a logged-in user.
 * `access_type=offline` + `prompt=consent` make Google return a refresh token
 * even when the user has linked before.
 */
export const getAuthorizationUrl = (userId: string, appRedirect: string) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: GOOGLE_HEALTH_CLIENT_ID ?? "",
    redirect_uri: GOOGLE_HEALTH_REDIRECT_URI ?? "",
    scope: REQUIRED_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: createState(userId, appRedirect),
  });
  return `${AUTH_URL}?${params}`;
};

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

const tokenRequest = async (params: Record<string, string>): Promise<GoogleTokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: GOOGLE_HEALTH_CLIENT_ID ?? "",
      client_secret: GOOGLE_HEALTH_CLIENT_SECRET ?? "",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let code: string | undefined;
    try { code = JSON.parse(errorText).error; } catch {}
    // Only invalid_grant means this user's grant is dead (revoked, expired or
    // the account changed). invalid_client etc. are our own config problems and
    // must not unlink anyone.
    const Err = code === "invalid_grant" ? FitbitAuthError : Error;
    throw new Err(`Google token request failed: ${response.status} ${response.statusText}, Details: ${errorText}`);
  }

  return (await response.json()) as GoogleTokenResponse;
};

const apiRequest = async (accessToken: string, path: string, body?: unknown): Promise<any> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const Err = response.status === 401 ? FitbitAuthError : Error;
    throw new Err(`Google Health API ${path} failed: ${response.status} ${response.statusText}, Details: ${errorText}`);
  }

  return response.json();
};

/**
 * Exchanges the authorization code for tokens and looks up the user's
 * Google Health user id (Google's token response doesn't carry one).
 */
export const getAccessToken = async (code: string) => {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    redirect_uri: GOOGLE_HEALTH_REDIRECT_URI ?? "",
    code,
  });
  const identity = await apiRequest(tokens.access_token, "/users/me/identity");
  if (!identity?.healthUserId) throw new Error("Google Health identity response had no healthUserId");
  return { ...tokens, healthUserId: String(identity.healthUserId) };
};

/** Scopes from REQUIRED_SCOPES the user did not grant. */
export const missingScopes = (granted: string | undefined) => {
  const have = new Set((granted ?? "").split(" "));
  return REQUIRED_SCOPES.filter((s) => !have.has(s));
};

/**
 * Refreshes an expired access token.
 */
export const refreshAccessToken = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Health user id -> IANA zone from their account settings. Zones rarely
// change, so one settings call per process lifetime is enough.
const settingsTimeZones = new Map<string, string>();

/**
 * The user's current calendar date ("yyyy-MM-dd") in their account's time
 * zone — the server's own date would be wrong for users far from UTC.
 */
const getUserToday = async (accessToken: string, cacheKey: string): Promise<string> => {
  let tz = settingsTimeZones.get(cacheKey);
  if (!tz) {
    try {
      const settings = await apiRequest(accessToken, "/users/me/settings");
      const candidate = settings?.timeZone;
      tz = typeof candidate === "string" && isValidTimeZone(candidate) ? candidate : "UTC";
      settingsTimeZones.set(cacheKey, tz);
    } catch (err) {
      if (err instanceof FitbitAuthError) throw err;
      tz = "UTC"; // don't block the sync on a settings hiccup; retry next time
    }
  }
  return zonedParts(new Date(), tz).ymd;
};

const shiftYmd = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// "2026-10-08" -> CivilDateTime at local midnight
const civilMidnight = (ymd: string) => {
  const [year, month, day] = ymd.split("-").map(Number);
  return { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } };
};

// One day's rollup ([today 00:00, tomorrow 00:00) in the user's civil time).
const dailyRollUp = async (accessToken: string, dataType: string, ymd: string) => {
  const res = await apiRequest(accessToken, `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    range: { start: civilMidnight(ymd), end: civilMidnight(shiftYmd(ymd, 1)) },
    windowSizeDays: 1,
  });
  return res?.rollupDataPoints?.[0];
};

const listDataPoints = async (accessToken: string, dataType: string, filter: string) => {
  const res = await apiRequest(
    accessToken,
    `/users/me/dataTypes/${dataType}/dataPoints?${new URLSearchParams({ filter })}`,
  );
  return (res?.dataPoints ?? []) as any[];
};

const ymdOf = (d: any) =>
  d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "";

export type DailyBiometrics = {
  steps: number;
  calories: number;
  restingHeartRate: number;
  hrv: number | null; // last night's average RMSSD (ms), null if not measured
  sleepMinutes: number;
};

// Daily records may lag a day (resting HR and HRV are computed after the
// night's sleep), so callers ask for yesterday onwards and take the newest.
const newestDaily = <T extends { date?: any }>(records: (T | undefined)[]) =>
  records
    .filter((r): r is T => Boolean(r))
    .sort((a, b) => ymdOf(b.date).localeCompare(ymdOf(a.date)))[0];

/**
 * Concurrently fetches today's steps, calories, resting heart rate, HRV and sleep.
 */
export const getAllDailyBiometrics = async (accessToken: string, cacheKey: string): Promise<DailyBiometrics> => {
  const today = await getUserToday(accessToken, cacheKey);
  const tomorrow = shiftYmd(today, 1);

  const [steps, calories, resting, hrv, sleep] = await Promise.all([
    dailyRollUp(accessToken, "steps", today),
    dailyRollUp(accessToken, "total-calories", today),
    // Resting HR and HRV are computed after the night's sleep, so today's may
    // not exist yet — take the newest of yesterday/today.
    listDataPoints(accessToken, "daily-resting-heart-rate",
      `daily_resting_heart_rate.date >= "${shiftYmd(today, -1)}"`),
    // HRV is optional for scoring, so a failure here mustn't sink the sync.
    listDataPoints(accessToken, "daily-heart-rate-variability",
      `daily_heart_rate_variability.date >= "${shiftYmd(today, -1)}"`)
      .catch((err) => {
        if (err instanceof FitbitAuthError) throw err;
        console.warn("[Fitbit] HRV fetch failed:", err.message);
        return [];
      }),
    // Sleep that ended today (last night + any naps), in the user's civil time.
    listDataPoints(accessToken, "sleep",
      `sleep.interval.civil_end_time >= "${today}" AND sleep.interval.civil_end_time < "${tomorrow}"`),
  ]);

  const latestResting = newestDaily(resting.map((p) => p.dailyRestingHeartRate));
  const latestHrv = newestDaily(hrv.map((p) => p.dailyHeartRateVariability));

  return {
    // int64 fields arrive as strings
    steps: Number(steps?.steps?.countSum) || 0,
    calories: Math.round(Number(calories?.totalCalories?.kcalSum) || 0),
    restingHeartRate: Number(latestResting?.beatsPerMinute) || 0,
    hrv: Number(latestHrv?.averageHeartRateVariabilityMilliseconds) || null,
    sleepMinutes: sleep.reduce((sum, p) => sum + (Number(p.sleep?.summary?.minutesAsleep) || 0), 0),
  };
};

/**
 * Rough 0–100 stress estimate from resting heart rate (same scale the alert
 * engine and dashboards use). The API doesn't expose a stress score, so this
 * is a proxy: ~55 bpm → ~10, ~80 bpm → ~54, ~95 bpm → ~81.
 */
const estimateStressScore = (restingHeartRate: number) =>
  restingHeartRate > 0 ? Math.round(Math.min(100, Math.max(0, (restingHeartRate - 50) * 1.8))) : 0;

/**
 * Saves processed biometric data to Prisma and runs the alert engine on it.
 */
export const saveBiometricData = async (userId: string, data: DailyBiometrics) => {
  const { steps, calories, restingHeartRate: heartRate, hrv, sleepMinutes } = data;
  const stressLevelScore = estimateStressScore(heartRate);

  const biometricLog = await prisma.biometricLog.create({
    data: {
      userId,
      heartRate,
      hrv,
      steps,
      calories,
      sleepHours: Math.round((sleepMinutes / 60) * 10) / 10,
      skinTemp: 0, // not measured: Fitbit exposes no continuous wrist temperature or EDA
      gsr: 0,
      movement: steps / 100, // crude movement proxy
      stressLevelScore,
    },
  });

  if (heartRate > 0) {
    scoreAndEvaluate({ studentId: userId, heartRate })
      .catch((err) => console.error("[AlertEngine] Health score evaluation error:", err.message));
  }

  return biometricLog;
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// One sync per user at a time, so concurrent requests share one token
// refresh and one set of API calls.
const inFlight = new Map<string, Promise<SyncResult>>();

export type SyncResult =
  | { status: "synced"; log: Awaited<ReturnType<typeof saveBiometricData>> }
  | { status: "skipped"; lastSyncedAt: Date }
  | { status: "not_linked" }
  | { status: "unlinked" }; // Fitbit rejected our tokens; link removed

const runSync = async (userId: string, force: boolean): Promise<SyncResult> => {
  let credentials = await prisma.fitbitCredential.findUnique({ where: { userId } });
  if (!credentials) return { status: "not_linked" };

  // Throttle using the last Fitbit-sourced reading.
  const lastLog = await prisma.biometricLog.findFirst({
    where: { userId, createdAt: { gte: credentials.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const minGap = force ? MIN_FORCED_SYNC_GAP_MS : MIN_SYNC_GAP_MS;
  if (lastLog && Date.now() - lastLog.createdAt.getTime() < minGap) {
    return { status: "skipped", lastSyncedAt: lastLog.createdAt };
  }

  try {
    // Refresh if expiring within 5 minutes
    if (credentials.expiresAt.getTime() < Date.now() + 300_000) {
      const newTokens = await refreshAccessToken(credentials.refreshToken);
      credentials = await prisma.fitbitCredential.update({
        where: { userId },
        data: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || credentials.refreshToken,
          expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        },
      });
    }

    const biometricData = await getAllDailyBiometrics(credentials.accessToken, credentials.fitbitUserId);
    const log = await saveBiometricData(userId, biometricData);
    return { status: "synced", log };
  } catch (err) {
    if (err instanceof FitbitAuthError) {
      // User revoked access in their Google account (or tokens are otherwise dead): drop the
      // link so the app prompts them to reconnect instead of failing silently.
      console.warn(`[Fitbit] Removing dead link for user ${userId}:`, err.message);
      await prisma.fitbitCredential.delete({ where: { userId } }).catch(() => {});
      return { status: "unlinked" };
    }
    throw err;
  }
};

/**
 * Pulls today's data from Fitbit for one user and stores it.
 * `force` shortens the throttle window (used for pull-to-refresh).
 */
export const syncFitbitForUser = (userId: string, { force = false } = {}) => {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const p = runSync(userId, force).finally(() => inFlight.delete(userId));
  inFlight.set(userId, p);
  return p;
};

let schedulerRunning = false;

const syncAllLinkedUsers = async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  let synced = 0, failed = 0;
  try {
    const links = await prisma.fitbitCredential.findMany({ select: { userId: true } });
    // Sequential on purpose — keeps us well clear of Fitbit's app-level limits.
    for (const { userId } of links) {
      try {
        const r = await syncFitbitForUser(userId);
        if (r.status === "synced") synced++;
      } catch (err: any) {
        failed++;
        console.error(`[Fitbit] Scheduled sync failed for user ${userId}:`, err.message);
      }
    }
    if (synced || failed) console.log(`[Fitbit] Scheduled sync: ${synced} synced, ${failed} failed`);
  } catch (err: any) {
    console.error("[Fitbit] Scheduled sync error:", err.message);
  } finally {
    schedulerRunning = false;
  }
};

/**
 * Starts the background job that keeps every linked user's data fresh.
 */
export const startFitbitSyncScheduler = () => {
  if (!GOOGLE_HEALTH_CLIENT_ID || !GOOGLE_HEALTH_CLIENT_SECRET) {
    console.warn("[Fitbit] Google Health client credentials not set — background sync disabled");
    return;
  }
  setTimeout(syncAllLinkedUsers, 30_000); // shortly after boot
  setInterval(syncAllLinkedUsers, SYNC_INTERVAL_MS);
  console.log(`[Fitbit] Background sync every ${SYNC_INTERVAL_MS / 60_000} min`);
};
