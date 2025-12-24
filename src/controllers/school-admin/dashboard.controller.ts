import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const getSchoolDashboard = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return res.status(403).json({
      message: "School admin must belong to a school",
    });
  }

  try {
    // Calculate UTC 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      studentsCount,
      counselorsCount,
      activeWearables,
      highRiskAlerts,
      recentAlertsRaw,
    ] = await Promise.all([
      // Count active students
      prisma.user.count({
        where: { schoolId, isActive: true, role: { name: "STUDENT" } },
      }),

      // Count active counselors
      prisma.user.count({
        where: { schoolId, isActive: true, role: { name: "COUNSELOR" } },
      }),

      // Count wearable activity in last 24 hours
      prisma.biometricLog.count({
        where: { timestamp: { gte: twentyFourHoursAgo }, user: { schoolId } },
      }),

      // Count unresolved high-risk alerts
      prisma.alert.count({
        where: {
          isResolved: false,
          alertType: { in: ["HIGH", "CRITICAL"] },
          student: { schoolId },
        },
      }),

      // Get 5 most recent alerts with student names
      prisma.alert.findMany({
        where: { student: { schoolId } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { student: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    // Map recent alerts safely
    const recentAlerts = recentAlertsRaw.map((alert) => ({
      id: alert.id,
      studentName: alert.student
        ? `${alert.student.firstName} ${alert.student.lastName}`
        : "Unknown",
      riskLevel: alert.alertType,
    }));

    return res.status(200).json({
      studentsCount,
      counselorsCount,
      activeWearables,
      highRiskAlerts,
      recentAlerts,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({
      message: "Failed to load dashboard data",
    });
  }
};
