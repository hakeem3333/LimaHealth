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
    const [
      studentsCount,
      counselorsCount,
      activeWearables,
      highRiskAlerts,
      recentAlertsRaw,
    ] = await Promise.all([
      // Students
      prisma.user.count({
        where: {
          schoolId,
          isActive: true,
          role: { name: "STUDENT" },
        },
      }),

      // Counselors
      prisma.user.count({
        where: {
          schoolId,
          isActive: true,
          role: { name: "COUNSELOR" },
        },
      }),

      // Wearables (biometric activity last 24h)
      prisma.biometricLog.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          user: { schoolId },
        },
      }),

      // High-risk alerts
      prisma.alert.count({
        where: {
          isResolved: false,
          alertType: {
            in: ["HIGH", "CRITICAL"],
          },
          student: { schoolId },
        },
      }),

      // Recent alerts
      prisma.alert.findMany({
        where: {
          student: { schoolId },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const recentAlerts = recentAlertsRaw.map((alert) => ({
      id: alert.id,
      studentName: `${alert.student.firstName} ${alert.student.lastName}`,
      riskLevel: alert.alertType,
    }));

    return res.json({
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
