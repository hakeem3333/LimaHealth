import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const getStudentProfile = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  const { studentId } = req.params;

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  try {
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [latestBiometric, recentBiometrics, alerts] = await Promise.all([
      // Latest biometric (wearable)
      prisma.biometricLog.findFirst({
        where: { userId: studentId },
        orderBy: { timestamp: "desc" },
      }),

      // Metrics (7 days)
      prisma.biometricLog.findMany({
        where: {
          userId: studentId,
          timestamp: { gte: sevenDaysAgo },
        },
        select: {
          stressLevelScore: true,
          movement: true,
        },
      }),

      // Alerts
      prisma.alert.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          counselor: {
            select: { firstName: true, lastName: true, id: true },
          },
        },
      }),
    ]);

    // Wearable status
    const wearableConnected =
      latestBiometric &&
      latestBiometric.timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Metrics calculation
    const avgStress7d =
      recentBiometrics.length > 0
        ? Math.round(
            recentBiometrics.reduce((sum, b) => sum + b.stressLevelScore, 0) /
              recentBiometrics.length
          )
        : null;

    const activityScore =
      recentBiometrics.length > 0
        ? Math.round(
            recentBiometrics.reduce((sum, b) => sum + b.movement, 0) /
              recentBiometrics.length
          )
        : null;

    // Risk level
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

    const unresolvedAlert = alerts.find((a) => !a.isResolved);

    if (unresolvedAlert) {
      if (["CRITICAL", "HIGH"].includes(unresolvedAlert.alertType)) {
        riskLevel = "HIGH";
      } else if (unresolvedAlert.alertType === "MEDIUM") {
        riskLevel = "MEDIUM";
      }
    }

    // Assigned counselor (last alert)
    const lastCounselor = alerts[0]?.counselor
      ? {
          id: alerts[0].counselor.id,
          name: `${alerts[0].counselor.firstName} ${alerts[0].counselor.lastName}`,
        }
      : null;

    return res.json({
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
        avgSleep7d: null, // not yet available
        activityScore,
      },

      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.alertType,
        riskLevel:
          alert.alertType === "CRITICAL" || alert.alertType === "HIGH"
            ? "HIGH"
            : alert.alertType === "MEDIUM"
            ? "MEDIUM"
            : "LOW",
        createdAt: alert.createdAt,
      })),
    });
  } catch (error) {
    console.error("Student profile error:", error);
    return res.status(500).json({ message: "Failed to load student profile" });
  }
};
