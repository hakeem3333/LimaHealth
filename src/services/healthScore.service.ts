import prisma from "./prisma.service.js";
import { moodRisk, moodScore, probabilityToRisk } from "../utils/mood.util.js";
import { getOrgThresholds, type OrgThresholds } from "../utils/orgThresholds.util.js";

// ---------------------------------------------------------------------------
// Health score — the single source of truth for a student's wellness risk.
// Blends the ML stress model with mood, sleep and activity (SCORE_WEIGHTS).
// Used by POST /ai/analyze, and after every biometric/mood log so the alert
// engine acts on the same score students and counselors see.
// ---------------------------------------------------------------------------

export type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface HealthScore {
  insights: string;
  riskScore: number; // 0–100
  riskLevel: RiskLevel;
  mlUsed: boolean;
  moodAvg: number | null;
  moodCount: number;
  sleepAvg: number | null;   // hours/night over the lifestyle window
  sleepTarget: number;       // org "Minimum Sleep Target", default 8h
  heartRateThreshold: number; // org "BPM Stress Trigger", default 100
  stepsAvg: number | null;   // steps/day over completed days in the window
  breakdown: Record<ScoreComponent, number | null>; // per-component risk 0–100, null = no data
  heartRate: number; // mean over the scoring window, for absolute-threshold alerts
  timestamp: string;
}

/** Values the client may send when no stored biometric logs exist yet. */
export interface BiometricFallback {
  heartRate?: number;
  stressLevel?: number;
  gsr?: number;
  skinTemp?: number;
  movement?: number;
}

const MOOD_WINDOW_DAYS = 7;
const BIOMETRIC_WINDOW = 10;
const LIFESTYLE_WINDOW_DAYS = 7;

// Share of the final score per component. Components without data are dropped
// and the remaining weights renormalised, so biometrics alone still score 0–100.
type ScoreComponent = "biometric" | "mood" | "sleep" | "activity";
const SCORE_WEIGHTS: Record<ScoreComponent, number> = {
  biometric: 0.5,
  mood:      0.25,
  sleep:     0.15,
  activity:  0.1,
};

const SLEEP_DEFICIT_MAX = 4;    // hours under target at which sleep risk is 100%
const STEPS_TARGET = 8000;      // steps/day at or above which activity risk is 0
const STEPS_FLOOR = 2000;       // steps/day at or below which activity risk is 100%

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// ML service call
// ---------------------------------------------------------------------------

interface MLPrediction {
  prediction: number;
  stress_probability: number;
  risk_level: RiskLevel;
}

async function callMLService(payload: {
  heart_rate: number;
  gsr: number;
  skin_temp: number;
  movement: number;
  gsr_std?: number;
  skin_temp_std?: number;
  heart_rate_std?: number;
  movement_std?: number;
}): Promise<MLPrediction | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json() as Promise<MLPrediction>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heuristic fallback
// ---------------------------------------------------------------------------

const LEVEL_INSIGHT: Record<RiskLevel, string> = {
  CRITICAL: "Critical stress indicators detected. Immediate counselor check-in recommended.",
  HIGH:     "Elevated stress detected. Consider a short break or breathing exercise.",
  MODERATE: "Mild stress noted. Monitoring is advised.",
  LOW:      "Vitals are within normal range.",
};

function heuristicAnalysis(heartRate: number, stressLevel: number, gsr: number, t: OrgThresholds) {
  if (heartRate >= t.heartRateCritical || stressLevel >= 80 || gsr >= 8)
    return { riskScore: 85, riskLevel: "CRITICAL" as RiskLevel, insights: LEVEL_INSIGHT.CRITICAL };
  if (heartRate >= t.heartRateHigh || stressLevel >= 65 || gsr >= 6)
    return { riskScore: 65, riskLevel: "HIGH" as RiskLevel, insights: LEVEL_INSIGHT.HIGH };
  if (stressLevel >= 40 || gsr >= 4)
    return { riskScore: 40, riskLevel: "MODERATE" as RiskLevel, insights: LEVEL_INSIGHT.MODERATE };
  return { riskScore: 10, riskLevel: "LOW" as RiskLevel, insights: LEVEL_INSIGHT.LOW };
}

function riskToInsight(riskLevel: string, stressProb: number): string {
  const pct = Math.round(stressProb * 100);
  if (riskLevel === "CRITICAL") return `Stress probability is ${pct}% — immediate counselor check-in recommended.`;
  if (riskLevel === "HIGH")     return `Stress probability is ${pct}% — consider a short break or breathing exercise.`;
  if (riskLevel === "MODERATE") return `Stress probability is ${pct}% — mild stress noted. Continue monitoring.`;
  return `Stress probability is ${pct}% — vitals are within normal range.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mean = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const localDay = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, server time zone

/**
 * Roll the lifestyle window up to one value per day. Fitbit syncs write a log
 * every ~30 min with that day's running totals, so the day's max is its total.
 * Today's steps are excluded (the day isn't over); today's sleep is last night's
 * and counts. Zeros mean "no data" (manual logs default steps/sleep to 0).
 */
async function lifestyleAverages(userId: string) {
  const logs = await prisma.biometricLog.findMany({
    where: { userId, timestamp: { gte: new Date(Date.now() - LIFESTYLE_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
    select: { timestamp: true, steps: true, sleepHours: true },
  });

  const days = new Map<string, { steps: number; sleep: number }>();
  for (const l of logs) {
    const key = localDay(l.timestamp);
    const d = days.get(key) ?? { steps: 0, sleep: 0 };
    d.steps = Math.max(d.steps, l.steps);
    d.sleep = Math.max(d.sleep, l.sleepHours);
    days.set(key, d);
  }

  const today = localDay(new Date());
  const sleepDays = [...days.values()].map((d) => d.sleep).filter((h) => h > 0);
  const stepDays  = [...days.entries()].filter(([k, d]) => k !== today && d.steps > 0).map(([, d]) => d.steps);

  return {
    sleepAvg: sleepDays.length ? mean(sleepDays) : null,
    stepsAvg: stepDays.length ? mean(stepDays) : null,
  };
}

async function thresholdsFor(userId: string): Promise<OrgThresholds> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { orgId: true } });
  return getOrgThresholds(user?.orgId);
}

const std = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a student from their recent biometric logs (ML model, heuristic
 * fallback if the ML service is unavailable), blended with the last week's
 * mood check-ins.
 */
export async function computeHealthScore(
  userId: string,
  fallback: BiometricFallback = {},
): Promise<HealthScore> {
  const logs = await prisma.biometricLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: BIOMETRIC_WINDOW,
    select: {
      heartRate: true,
      gsr: true,
      skinTemp: true,
      movement: true,
      stressLevelScore: true,
    },
  });

  const heartRates = logs.map((l) => l.heartRate);
  const gsrValues  = logs.map((l) => l.gsr);
  const temps      = logs.map((l) => l.skinTemp);
  const movements  = logs.map((l) => l.movement);

  const payload = {
    heart_rate:     mean(heartRates) || fallback.heartRate || 0,
    gsr:            mean(gsrValues)  || fallback.gsr       || 0,
    skin_temp:      mean(temps)      || fallback.skinTemp  || 0,
    movement:       mean(movements)  || fallback.movement  || 0,
    heart_rate_std: std(heartRates),
    gsr_std:        std(gsrValues),
    skin_temp_std:  std(temps),
    movement_std:   std(movements),
  };

  let insights: string;
  let riskScore: number;
  let riskLevel: RiskLevel;
  let mlUsed = false;
  let moodAvg: number | null = null;
  let moodCount = 0;

  const [prediction, thresholds] = await Promise.all([callMLService(payload), thresholdsFor(userId)]);
  const { sleepTarget } = thresholds;

  if (prediction) {
    mlUsed    = true;
    riskLevel = prediction.risk_level;
    riskScore = Math.round(prediction.stress_probability * 100);
    insights  = riskToInsight(riskLevel, prediction.stress_probability);
  } else {
    const stressLevel = logs[0]?.stressLevelScore ?? fallback.stressLevel ?? 0;
    const heuristic = heuristicAnalysis(payload.heart_rate, stressLevel, payload.gsr, thresholds);
    riskScore = heuristic.riskScore;
    riskLevel = heuristic.riskLevel;
    insights  = heuristic.insights;
  }

  // Blend in mood, sleep and activity from the last week.
  const [moodLogs, lifestyle] = await Promise.all([
    prisma.moodLog.findMany({
      where: { userId, timestamp: { gte: new Date(Date.now() - MOOD_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
      orderBy: { timestamp: "desc" },
      take: 14,
      select: { moodEmoji: true },
    }),
    lifestyleAverages(userId),
  ]);

  if (moodLogs.length) {
    moodCount = moodLogs.length;
    moodAvg = mean(moodLogs.map((m) => moodScore(m.moodEmoji)));
  }
  const { sleepAvg, stepsAvg } = lifestyle;

  const risks: Record<ScoreComponent, number | null> = {
    biometric: riskScore / 100,
    mood:      moodAvg === null ? null : moodRisk(moodAvg),
    sleep:     sleepAvg === null ? null : clamp01((sleepTarget - sleepAvg) / SLEEP_DEFICIT_MAX),
    activity:  stepsAvg === null ? null : clamp01((STEPS_TARGET - stepsAvg) / (STEPS_TARGET - STEPS_FLOOR)),
  };

  const present = (Object.keys(risks) as ScoreComponent[]).filter((k) => risks[k] !== null);
  if (present.length > 1) {
    const totalWeight = present.reduce((w, k) => w + SCORE_WEIGHTS[k], 0);
    const blended = present.reduce((acc, k) => acc + SCORE_WEIGHTS[k] * risks[k]!, 0) / totalWeight;
    const blendedLevel = probabilityToRisk(blended);

    insights = mlUsed
      ? riskToInsight(blendedLevel, blended)
      : blendedLevel === riskLevel ? insights : LEVEL_INSIGHT[blendedLevel];
    riskScore = Math.round(blended * 100);
    riskLevel = blendedLevel;
  }

  if (moodAvg !== null && moodAvg <= 2.5) {
    insights += ` Your mood has been low lately (${moodAvg.toFixed(1)}/5 across ${moodCount} check-ins).`;
  }
  if (sleepAvg !== null && sleepAvg < sleepTarget - 1) {
    insights += ` You've averaged ${sleepAvg.toFixed(1)}h of sleep — aim for ${sleepTarget}h.`;
  }
  if (stepsAvg !== null && stepsAvg < 5000) {
    insights += ` Activity has been low (~${Math.round(stepsAvg).toLocaleString("en-US")} steps/day) — a short walk can help.`;
  }

  const pct = (r: number | null) => (r === null ? null : Math.round(r * 100));

  return {
    insights, riskScore, riskLevel, mlUsed,
    moodAvg: moodAvg === null ? null : Number(moodAvg.toFixed(2)),
    moodCount,
    sleepAvg: sleepAvg === null ? null : Number(sleepAvg.toFixed(1)),
    sleepTarget,
    heartRateThreshold: thresholds.heartRateHigh,
    stepsAvg: stepsAvg === null ? null : Math.round(stepsAvg),
    breakdown: {
      biometric: pct(risks.biometric),
      mood:      pct(risks.mood),
      sleep:     pct(risks.sleep),
      activity:  pct(risks.activity),
    },
    heartRate: Math.round(payload.heart_rate),
    timestamp: new Date().toISOString(),
  };
}

/** Compute the health score and persist it as an AIAnalysis record. */
export async function scoreAndStore(
  userId: string,
  inputJson: Record<string, unknown> = {},
  fallback: BiometricFallback = {},
) {
  const score = await computeHealthScore(userId, fallback);
  const analysis = await prisma.aIAnalysis.create({
    data: { userId, context: "biometric_summary", inputJson: inputJson as any, outputJson: score as any },
  });
  return { score, analysis };
}
