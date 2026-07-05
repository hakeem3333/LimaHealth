import prisma from "./prisma.service.js";
import { sendEmail } from "./email.service.js";

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
// Biometric thresholds
// ---------------------------------------------------------------------------

const BIOMETRIC_RULES = {
  STRESS_CRITICAL: {
    test: (s: number) => s >= 80,
    type: "STRESS_CRITICAL",
    severity: "CRITICAL" as AlertSeverity,
    message: (name: string, score: number) =>
      `${name}'s stress level reached ${score}/100 — immediate check-in recommended.`,
  },
  STRESS_HIGH: {
    test: (s: number) => s >= 65,
    type: "STRESS_HIGH",
    severity: "HIGH" as AlertSeverity,
    message: (name: string, score: number) =>
      `${name}'s stress level is elevated at ${score}/100.`,
  },
  HEART_RATE_CRITICAL: {
    test: (hr: number) => hr >= 120,
    type: "HEART_RATE_CRITICAL",
    severity: "CRITICAL" as AlertSeverity,
    message: (name: string, hr: number) =>
      `${name}'s heart rate is critically high at ${hr} bpm.`,
  },
  HEART_RATE_HIGH: {
    test: (hr: number) => hr >= 100,
    type: "HEART_RATE_HIGH",
    severity: "HIGH" as AlertSeverity,
    message: (name: string, hr: number) =>
      `${name}'s heart rate is elevated at ${hr} bpm.`,
  },
};

// ---------------------------------------------------------------------------
// Mood thresholds
// ---------------------------------------------------------------------------

const LOW_MOOD_VALUES = new Set(["LOW", "DOWN", "AWFUL"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the organisation's first active counselor.
 * If no counselor exists the alert cannot be created — return null.
 */
async function findCounselor(orgId: string): Promise<string | null> {
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

  await sendEmail({
    to: counselorEmail,
    subject: `[LimaHealth Alert] ${alertType.replace(/_/g, " ")}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
        <h2 style="color:#7C3AED">Student Wellness Alert</h2>
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
 * Evaluate biometric data against alert rules.
 * Called after every biometric log is saved.
 */
export async function evaluateBiometricAlert(params: {
  studentId: string;
  orgId: string;
  heartRate: number;
  stressLevelScore: number;
  studentName: string;
}): Promise<void> {
  const { studentId, orgId, heartRate, stressLevelScore, studentName } = params;

  const counselorId = await findCounselor(orgId);
  if (!counselorId) return; // no counselor to notify

  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: { email: true },
  });
  if (!counselor) return;

  // Evaluate rules in priority order (most severe first)
  const checks = [
    {
      rule: BIOMETRIC_RULES.STRESS_CRITICAL,
      value: stressLevelScore,
      label: stressLevelScore,
    },
    {
      rule: BIOMETRIC_RULES.HEART_RATE_CRITICAL,
      value: heartRate,
      label: heartRate,
    },
    {
      rule: BIOMETRIC_RULES.STRESS_HIGH,
      value: stressLevelScore,
      label: stressLevelScore,
    },
    {
      rule: BIOMETRIC_RULES.HEART_RATE_HIGH,
      value: heartRate,
      label: heartRate,
    },
  ];

  for (const { rule, value, label } of checks) {
    if (rule.test(value)) {
      const duplicate = await isDuplicate(studentId, rule.type);
      if (!duplicate) {
        await fireAlert(
          studentId,
          counselorId,
          counselor.email,
          rule.type,
          rule.severity,
          rule.message(studentName, label),
        );
        // Fire at most one biometric alert per evaluation
        return;
      }
    }
  }
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

  const allLow = recentMoods.every((m) => LOW_MOOD_VALUES.has(m.moodEmoji));
  const alertType = allLow ? "MOOD_CRITICAL" : "MOOD_LOW";
  const windowMinutes = allLow ? 120 : 60;

  const duplicate = await isDuplicate(studentId, alertType, windowMinutes);
  if (duplicate) return;

  const counselorId = await findCounselor(orgId);
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

  await fireAlert(studentId, counselorId, counselor.email, alertType, severity, message);
}
