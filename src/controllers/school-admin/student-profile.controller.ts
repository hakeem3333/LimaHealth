import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Map alertType to risk level
 */
function mapAlertToRisk(alertType: string): RiskLevel {
  if (alertType === "CRITICAL" || alertType === "HIGH") return "HIGH";
  if (alertType === "MEDIUM") return "MEDIUM";
  return "LOW";
}

/**
 * Compute average of numeric array
 */
function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((sum, val) => sum + val, 0) / arr.length);
}

export const getStudentProfile = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  const { studentId } = req.params;

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  try {
    // Fetch student basic info
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        schoolId,
        role: { name: "STUDENT" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    // Fetch latest biometric, 7-day metrics, and recent alerts in parallel
    const [latestBiometric, recentBiometrics, alerts] = await Promise.all([
      prisma.biometricLog.findFirst({
        where: { userId: studentId },
        orderBy: { timestamp: "desc" },
      }),
      prisma.biometricLog.findMany({
        where: { userId: studentId, timestamp: { gte: sevenDaysAgo } },
        select: { stressLevelScore: true, movement: true },
      }),
      prisma.alert.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          counselor: { select: { firstName: true, lastName: true, id: true } },
        },
      }),
    ]);

    // Determine wearable connection
    const wearableConnected =
      latestBiometric?.timestamp &&
      latestBiometric.timestamp.getTime() >= Date.now() - ONE_DAY_MS;

    // Calculate metrics
    const avgStress7d = average(
      recentBiometrics.map((b) => b.stressLevelScore)
    );
    const activityScore = average(recentBiometrics.map((b) => b.movement));

    // Determine highest risk level from unresolved alerts
    const unresolvedAlerts = alerts.filter((a) => !a.isResolved);
    const riskLevel: RiskLevel =
      unresolvedAlerts.length > 0
        ? unresolvedAlerts
            .map((a) => mapAlertToRisk(a.alertType))
            .sort((a, b) => {
              const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
              return order.indexOf(b) - order.indexOf(a);
            })[0]
        : "LOW";

    // Assigned counselor from most recent alert
    const lastCounselor = alerts[0]?.counselor
      ? {
          id: alerts[0].counselor.id,
          name: `${alerts[0].counselor.firstName} ${alerts[0].counselor.lastName}`,
        }
      : null;

    return res.status(200).json({
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
      isActive: student.isActive,
      riskLevel,
      wearable: {
        connected: Boolean(wearableConnected),
        lastSync: latestBiometric?.timestamp ?? null,
      },
      counselor: lastCounselor,
      metrics: {
        avgStress7d,
        avgSleep7d: null, // placeholder
        activityScore,
      },
      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.alertType,
        riskLevel: mapAlertToRisk(alert.alertType),
        createdAt: alert.createdAt,
      })),
    });
  } catch (error) {
    console.error("getStudentProfile error:", error);
    return res.status(500).json({ message: "Failed to load student profile" });
  }
};
