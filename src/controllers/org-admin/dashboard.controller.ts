import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";

export const getOrgDashboard = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;

  if (!orgId) {
    return res.status(403).json({
      message: "Org admin must belong to an organisation",
    });
  }

  try {
    // 🛡️ 1. Fetch Org Status first
    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { status: true },
    });

    // 🛡️ 2. Billing/Activation Gate
    if (!org || org.status !== "ACTIVE") {
      if (org?.status === "PAYMENT_REQUIRED") {
        return res.status(402).json({
          message: "Payment Required",
          reason: "SUBSCRIPTION_REQUIRED",
        });
      }

      if (org?.status === "EXPIRED") {
        return res.status(402).json({
          message: "Subscription Expired",
          reason: "SUBSCRIPTION_EXPIRED",
        });
      }

      return res.status(403).json({
        message: `Dashboard access restricted. Status: ${org?.status || "Unknown"}`,
      });
    }

    // 3. Main Data Fetch (only runs if org is ACTIVE)
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
          orgId,
          isActive: true,
          role: { name: "STUDENT" },
        },
      }),

      // Counselors
      prisma.user.count({
        where: {
          orgId,
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
          user: { orgId },
        },
      }),

      // High-risk alerts
      prisma.alert.count({
        where: {
          isResolved: false,
          alertType: {
            in: ["HIGH", "CRITICAL"],
          },
          student: { orgId },
        },
      }),

      // Recent alerts
      prisma.alert.findMany({
        where: {
          student: { orgId },
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
