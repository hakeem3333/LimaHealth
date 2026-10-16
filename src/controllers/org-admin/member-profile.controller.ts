import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { calculateAge, formatDateOfBirth, isMinor } from "../../utils/age.util";
import { riskFromSeverities } from "../../utils/risk.util";

export const getMemberProfile = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const { studentId } = req.params;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  try {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        orgId,
        role: { name: "STUDENT" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        dateOfBirth: true,
        assignedCounselor: {
          select: { id: true, firstName: true, lastName: true },
        },
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
    const riskLevel = riskFromSeverities(alerts.filter((a) => !a.isResolved).map((a) => a.severity));

    // Assigned counselor (real caseload assignment, not a guess from alert history)
    const assignedCounselor = student.assignedCounselor
      ? {
          id: student.assignedCounselor.id,
          name: `${student.assignedCounselor.firstName} ${student.assignedCounselor.lastName}`,
        }
      : null;

    return res.json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
      isActive: student.isActive,
      dateOfBirth: formatDateOfBirth(student.dateOfBirth),
      age: calculateAge(student.dateOfBirth),
      isMinor: isMinor(student.dateOfBirth),
      riskLevel,

      wearable: {
        connected: Boolean(wearableConnected),
        lastSync: latestBiometric?.timestamp ?? null,
      },

      counselor: assignedCounselor,

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
