import prisma from "./prisma.service.js";
import { moodRisk, moodScore, probabilityToRisk } from "../utils/mood.util.js";
import { getOrgThresholds, type OrgThresholds } from "../utils/orgThresholds.util.js";

// ---------------------------------------------------------------------------
// Health score — the single source of truth for a student's wellness risk.
// The biometric component comes from, in order of preference:
//   1. the ML stress model, only when real skin sensors (GSR + temperature)
//      were logged — it was trained on wrist EDA/temperature and is
//      meaningless without them;
//   2. the student's personal baseline: today's resting heart rate and HRV
//      against their own last few weeks (what Fitbit actually provides);
//   3. absolute-threshold heuristics while the baseline is still calibrating.
// It is then blended with mood, sleep and activity (SCORE_WEIGHTS).
// Used by POST /ai/analyze, and after every biometric/mood log so the alert
// engine acts on the same score students and counselors see.
// ---------------------------------------------------------------------------

export type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface HealthScore {
  insights: string;
  riskScore: number; // 0–100
  riskLevel: RiskLevel;
  mlUsed: boolean;
  biometricMethod: BiometricMethod;
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

export type BiometricMethod = "ml" | "baseline" | "heuristic";

const BASELINE_DAYS = 28;       // history the personal baseline is built from
const MIN_BASELINE_DAYS = 7;    // days of history needed before a signal is scored
const Z_FOR_MAX_RISK = 4;       // deviation (SDs from the student's norm) at which a signal's risk is 100%
// Minimum SDs, roughly normal night-to-night variation, so a very steady
// baseline can't turn ordinary noise into alarms.
const HR_SD_FLOOR = 3;          // bpm
const HRV_SD_FLOOR = 8;         // ms

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

const BASELINE_INSIGHT: Record<RiskLevel, string> = {
  CRITICAL: "Your body is under much more strain than usual. A counselor check-in is recommended.",
  HIGH:     "Your body is showing more strain than usual. Consider rest, a short break or a breathing exercise.",
  MODERATE: "Your vitals are a little off your usual pattern. Keep an eye on rest and stress.",
  LOW:      "Your vitals are within your normal range.",
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

const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

// ---------------------------------------------------------------------------
// Personal baseline
// ---------------------------------------------------------------------------

/** One value per day, oldest first; null where a signal wasn't measured. */
export interface DailyVitals {
  day: string;
  heartRate: number | null;
  hrv: number | null;
}

export interface BaselineResult {
  risk: number | null; // 0–1, null while calibrating
  notes: string[];     // plain-language deviations worth telling the student
  baselineDays: number; // history behind the best-covered signal
}

/**
 * Score the latest day against the days before it. Each signal becomes a
 * z-score in the stress direction (resting HR up, HRV down), clamped to
 * ±Z_FOR_MAX_RISK; their average maps linearly onto 0–1. A good HRV night can
 * therefore offset a slightly raised heart rate, which matches physiology.
 */
export function scoreAgainstBaseline(days: DailyVitals[]): BaselineResult {
  const signals = [
    { key: "heartRate" as const, direction: 1,  floor: HR_SD_FLOOR },
    { key: "hrv" as const,       direction: -1, floor: HRV_SD_FLOOR },
  ];

  const zs: number[] = [];
  const notes: string[] = [];
  let baselineDays = 0;

  const measured = (v: number | null | undefined): v is number => v != null && v > 0;

  for (const { key, direction, floor } of signals) {
    // Only the latest day counts as "today": an older reading is stale, not current.
    const current = days.at(-1)?.[key];
    const history = days.slice(0, -1).map((d) => d[key]).filter(measured).slice(-BASELINE_DAYS);
    baselineDays = Math.max(baselineDays, history.length);
    if (!measured(current) || history.length < MIN_BASELINE_DAYS) continue;

    const norm = mean(history);
    const z = (direction * (current - norm)) / Math.max(std(history), floor);
    zs.push(Math.min(Z_FOR_MAX_RISK, Math.max(-Z_FOR_MAX_RISK, z)));

    if (key === "heartRate" && current - norm >= 3) {
      notes.push(`Your resting heart rate is ${Math.round(current - norm)} bpm above your usual ${Math.round(norm)} bpm.`);
    }
    if (key === "hrv" && (norm - current) / norm >= 0.1) {
      notes.push(`Your heart rate variability is ${Math.round(((norm - current) / norm) * 100)}% below your usual — a sign of strain or poor recovery.`);
    }
  }

  return {
    risk: zs.length ? clamp01(mean(zs) / Z_FOR_MAX_RISK) : null,
    notes,
    baselineDays,
  };
}

/**
 * Daily resting HR and HRV over the baseline window. Fitbit syncs write the
 * same daily values every ~30 min, so each day's median is that day's value;
 * for manual spot readings it damps one-off spikes.
 */
async function dailyVitals(userId: string): Promise<DailyVitals[]> {
  const logs = await prisma.biometricLog.findMany({
    where: { userId, timestamp: { gte: new Date(Date.now() - (BASELINE_DAYS + 1) * 24 * 60 * 60 * 1000) } },
    select: { timestamp: true, heartRate: true, hrv: true },
  });

  const days = new Map<string, { hr: number[]; hrv: number[] }>();
  for (const l of logs) {
    const key = localDay(l.timestamp);
    const d = days.get(key) ?? { hr: [], hrv: [] };
    if (l.heartRate > 0) d.hr.push(l.heartRate);
    if (l.hrv !== null && l.hrv > 0) d.hrv.push(l.hrv);
    days.set(key, d);
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day,
      heartRate: d.hr.length ? median(d.hr) : null,
      hrv: d.hrv.length ? median(d.hrv) : null,
    }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a student from their recent biometric logs (ML model when skin sensors
 * were logged, else their personal baseline, else heuristics), blended with
 * the last week's mood, sleep and activity.
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

  const heartRate = mean(logs.map((l) => l.heartRate)) || fallback.heartRate || 0;
  const gsr       = mean(logs.map((l) => l.gsr))       || fallback.gsr       || 0;

  // The ML model only sees logs with real skin sensors; 0 means "not measured".
  const sensorLogs = logs.filter((l) => l.gsr > 0 && l.skinTemp > 0);
  const series = (key: "heartRate" | "gsr" | "skinTemp" | "movement") => sensorLogs.map((l) => l[key]);
  const mlPayload = sensorLogs.length
    ? {
        heart_rate:     mean(series("heartRate")),
        gsr:            mean(series("gsr")),
        skin_temp:      mean(series("skinTemp")),
        movement:       mean(series("movement")),
        heart_rate_std: std(series("heartRate")),
        gsr_std:        std(series("gsr")),
        skin_temp_std:  std(series("skinTemp")),
        movement_std:   std(series("movement")),
      }
    : !logs.length && fallback.gsr && fallback.skinTemp
      ? {
          heart_rate: fallback.heartRate ?? 0,
          gsr:        fallback.gsr,
          skin_temp:  fallback.skinTemp,
          movement:   fallback.movement ?? 0,
        }
      : null;

  let insights: string;
  let riskScore: number;
  let riskLevel: RiskLevel;
  let biometricMethod: BiometricMethod;
  let biometricNotes: string[] = [];
  let moodAvg: number | null = null;
  let moodCount = 0;

  const [prediction, baseline, thresholds] = await Promise.all([
    mlPayload ? callMLService(mlPayload) : Promise.resolve(null),
    dailyVitals(userId).then(scoreAgainstBaseline),
    thresholdsFor(userId),
  ]);
  const { sleepTarget } = thresholds;

  if (prediction) {
    biometricMethod = "ml";
    riskLevel = prediction.risk_level;
    riskScore = Math.round(prediction.stress_probability * 100);
    insights  = riskToInsight(riskLevel, prediction.stress_probability);
  } else if (baseline.risk !== null) {
    biometricMethod = "baseline";
    riskLevel = probabilityToRisk(baseline.risk);
    riskScore = Math.round(baseline.risk * 100);
    insights  = BASELINE_INSIGHT[riskLevel];
    biometricNotes = baseline.notes;
  } else {
    biometricMethod = "heuristic";
    const stressLevel = logs[0]?.stressLevelScore ?? fallback.stressLevel ?? 0;
    const heuristic = heuristicAnalysis(heartRate, stressLevel, gsr, thresholds);
    riskScore = heuristic.riskScore;
    riskLevel = heuristic.riskLevel;
    insights  = heuristic.insights;
    if (heartRate > 0) {
      biometricNotes = [`Your personal baseline is still calibrating (${baseline.baselineDays} of ${MIN_BASELINE_DAYS} days).`];
    }
  }
  const mlUsed = biometricMethod === "ml";

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
      : blendedLevel === riskLevel ? insights
      : biometricMethod === "baseline" ? BASELINE_INSIGHT[blendedLevel] : LEVEL_INSIGHT[blendedLevel];
    riskScore = Math.round(blended * 100);
    riskLevel = blendedLevel;
  }

  if (biometricMethod === "baseline" && riskLevel === "LOW" && biometricNotes.length) {
    insights = "Overall you're doing okay, but some of your vitals are off your usual pattern.";
  }
  for (const note of biometricNotes) insights += ` ${note}`;

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
    insights, riskScore, riskLevel, mlUsed, biometricMethod,
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
    heartRate: Math.round(heartRate),
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
