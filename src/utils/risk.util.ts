/**
 * Student risk band shown in the org-admin views, derived from the severity
 * of their *unresolved* alerts. Alert.severity is CRITICAL | HIGH | MODERATE;
 * alertType (PANIC_BUTTON, MOOD_CRITICAL, …) says what happened, not how bad.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export function riskFromSeverities(severities: Iterable<string | null | undefined>): RiskLevel {
  let risk: RiskLevel = "LOW";
  for (const severity of severities) {
    if (severity === "CRITICAL" || severity === "HIGH") return "HIGH";
    if (severity === "MODERATE") risk = "MEDIUM";
  }
  return risk;
}
