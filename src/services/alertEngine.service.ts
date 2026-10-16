import prisma from "./prisma.service.js";
import { sendEmail } from "./email.service.js";
import { LOW_MOOD_VALUES } from "../utils/mood.util.js";
import { scoreAndStore, type HealthScore } from "./healthScore.service.js";
import { getOrgThresholds, type OrgThresholds } from "../utils/orgThresholds.util.js";
import { getMemberLabel } from "../utils/orgType.util.js";

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type AlertSeverity = "CRITICAL" | "HIGH" | "MODERATE";

export interface AlertRule {
  type: string;
  severity: AlertSeverity;
  message: string;
}

// ---------------------------------------------------------------------------
// Health score thresholds
// ---------------------------------------------------------------------------

// Risk alerts are driven by the shared health score (ML stress probability
// blended with mood — see healthScore.service.ts), the same score shown in the
// student app. Heart-rate rules check the latest reading against the org's
// "BPM Stress Trigger" (HIGH) and that + 20 bpm (CRITICAL).
const HEALTH_SCORE_RULES = {
  STRESS_CRITICAL: {
    test: (s: HealthScore) => s.riskLevel === "CRITICAL",
    type: "STRESS_CRITICAL",
    severity: "CRITICAL" as AlertSeverity,
    message: (name: string, s: HealthScore) =>
      `${name}'s wellness risk score reached ${s.riskScore}/100 — immediate check-in recommended.`,
  },
  STRESS_HIGH: {
    test: (s: HealthScore) => s.riskLevel === "HIGH",
    type: "STRESS_HIGH",
    severity: "HIGH" as AlertSeverity,
    message: (name: string, s: HealthScore) =>
      `${name}'s wellness risk score is elevated at ${s.riskScore}/100.`,
  },
};

const HEART_RATE_RULES = {
  HEART_RATE_CRITICAL: {
    test: (hr: number, t: OrgThresholds) => hr >= t.heartRateCritical,
    type: "HEART_RATE_CRITICAL",
    severity: "CRITICAL" as AlertSeverity,
    message: (name: string, hr: number) =>
      `${name}'s heart rate is critically high at ${hr} bpm.`,
  },
  HEART_RATE_HIGH: {
    test: (hr: number, t: OrgThresholds) => hr >= t.heartRateHigh,
    type: "HEART_RATE_HIGH",
    severity: "HIGH" as AlertSeverity,
    message: (name: string, hr: number) =>
      `${name}'s heart rate is elevated at ${hr} bpm.`,
  },
};

// ---------------------------------------------------------------------------
// Mood thresholds
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The counselor an alert about this student goes to: their assigned counselor
 * (if still active in the same org), else the org's first active counselor so
 * unassigned students aren't silently dropped.
 * If no counselor exists the alert cannot be created — return null.
 */
async function findCounselor(studentId: string, orgId: string): Promise<string | null> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { assignedCounselor: { select: { id: true, orgId: true, isActive: true } } },
  });
  const assigned = student?.assignedCounselor;
  if (assigned && assigned.orgId === orgId && assigned.isActive) return assigned.id;

  const counselor = await prisma.user.findFirst({
    where: {
      orgId,
      isActive: true,
      role: { name: "COUNSELOR" },
    },
    select: { id: true },
  });
  return counselor?.id ?? null;
}

/**
 * Deduplication: has an unresolved alert of this type been created for this
 * student in the last `windowMinutes` minutes?
 */
async function isDuplicate(
  studentId: string,
  alertType: string,
  windowMinutes = 60,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      studentId,
      alertType,
      isResolved: false,
      createdAt: { gte: since },
    },
  });
  return existing !== null;
}

/**
 * Create the alert record and email the counselor.
 */
async function fireAlert(
  orgId: string,
  studentId: string,
  counselorId: string,
  counselorEmail: string,
  alertType: string,
  severity: AlertSeverity,
  message: string,
) {
  await prisma.alert.create({
    data: { studentId, counselorId, alertType, severity, message },
  });

  // Word the email for the org ("Patient Wellness Alert" in a hospital, etc.)
  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { orgType: true } });
  const memberLabel = getMemberLabel(org?.orgType ?? "");

  await sendEmail({
    to: counselorEmail,
    subject: `[LimaHealth Alert] ${alertType.replace(/_/g, " ")}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
        <h2 style="color:#7C3AED">${memberLabel} Wellness Alert</h2>
        <p>${message}</p>
        <p>Please log in to the LimaHealth dashboard to review and respond.</p>
        <p style="color:#6B7280;font-size:12px">— LimaHealth Automated Monitoring</p>
      </div>
    `,
  }).catch((err) => {
    // Email is best-effort — don't let it fail the main request
    console.error("[AlertEngine] Email failed:", err.message);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a computed health score against alert rules.
 * `heartRate` is the latest reading when available (catches spikes the
 * windowed average would smooth out); otherwise the score's average is used.
 */
export async function evaluateHealthScoreAlert(params: {
  studentId: string;
  orgId: string;
  studentName: string;
  score: HealthScore;
  heartRate?: number | undefined;
}): Promise<void> {
  const { studentId, orgId, studentName, score } = params;
  const heartRate = Math.round(params.heartRate ?? score.heartRate);

  const counselorId = await findCounselor(studentId, orgId);
  if (!counselorId) return; // no counselor to notify

  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: { email: true },
  });
  if (!counselor) return;

  // Heart-rate limits come from the org's "BPM Stress Trigger" setting
  const thresholds = await getOrgThresholds(orgId);

  // Evaluate rules in priority order (most severe first)
  const checks = [
    { rule: HEALTH_SCORE_RULES.STRESS_CRITICAL, hit: HEALTH_SCORE_RULES.STRESS_CRITICAL.test(score),
      message: () => HEALTH_SCORE_RULES.STRESS_CRITICAL.message(studentName, score) },
    { rule: HEART_RATE_RULES.HEART_RATE_CRITICAL, hit: HEART_RATE_RULES.HEART_RATE_CRITICAL.test(heartRate, thresholds),
      message: () => HEART_RATE_RULES.HEART_RATE_CRITICAL.message(studentName, heartRate) },
    { rule: HEALTH_SCORE_RULES.STRESS_HIGH, hit: HEALTH_SCORE_RULES.STRESS_HIGH.test(score),
      message: () => HEALTH_SCORE_RULES.STRESS_HIGH.message(studentName, score) },
    { rule: HEART_RATE_RULES.HEART_RATE_HIGH, hit: HEART_RATE_RULES.HEART_RATE_HIGH.test(heartRate, thresholds),
      message: () => HEART_RATE_RULES.HEART_RATE_HIGH.message(studentName, heartRate) },
  ];

  for (const { rule, hit, message } of checks) {
    if (hit) {
      const duplicate = await isDuplicate(studentId, rule.type);
      if (!duplicate) {
        await fireAlert(
          orgId,
          studentId,
          counselorId,
          counselor.email,
          rule.type,
          rule.severity,
          message(),
        );
        // Fire at most one biometric alert per evaluation
        return;
      }
    }
  }
}

/**
 * Recompute and store the student's health score, then run the alert rules
 * on it. Called after every biometric log (manual or Fitbit) and mood log.
 */
export async function scoreAndEvaluate(params: {
  studentId: string;
  heartRate?: number | undefined;
}): Promise<HealthScore | null> {
  const { studentId, heartRate } = params;

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { orgId: true, firstName: true, lastName: true },
  });
  if (!student) return null;

  const { score } = await scoreAndStore(studentId, { trigger: "auto", heartRate: heartRate ?? null });

  if (student.orgId) {
    await evaluateHealthScoreAlert({
      studentId,
      orgId: student.orgId,
      studentName: `${student.firstName} ${student.lastName}`,
      score,
      heartRate,
    });
  }
  return score;
}

/**
 * Evaluate a new mood log entry.
 * Fires an alert if the student has logged negative moods repeatedly.
 * Called after every mood log is saved.
 */
export async function evaluateMoodAlert(params: {
  studentId: string;
  orgId: string;
  mood: string;
  studentName: string;
}): Promise<void> {
  const { studentId, orgId, mood, studentName } = params;

  if (!LOW_MOOD_VALUES.has(mood)) return; // only flag negative moods

  // Look at the last 3 mood logs (including the one just saved)
  const recentMoods = await prisma.moodLog.findMany({
    where: { userId: studentId },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { moodEmoji: true },
  });

  // Critical only once there really are 3 logs — a student's first low mood is not a streak.
  const allLow =
    recentMoods.length === 3 && recentMoods.every((m) => LOW_MOOD_VALUES.has(m.moodEmoji));
  const alertType = allLow ? "MOOD_CRITICAL" : "MOOD_LOW";
  const windowMinutes = allLow ? 120 : 60;

  const duplicate = await isDuplicate(studentId, alertType, windowMinutes);
  if (duplicate) return;

  const counselorId = await findCounselor(studentId, orgId);
  if (!counselorId) return;

  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: { email: true },
  });
  if (!counselor) return;

  const severity: AlertSeverity = allLow ? "CRITICAL" : "MODERATE";
  const message = allLow
    ? `${studentName} has logged negative mood (${mood}) 3 times in a row — wellbeing check recommended.`
    : `${studentName} logged a low mood: ${mood}.`;

  await fireAlert(orgId, studentId, counselorId, counselor.email, alertType, severity, message);
}
