// controllers/schoolReports.controller.ts
import { Response } from "express";
import prisma from "../services/prisma.service";
import { AuthRequest } from "../types/auth.types";
import { getDateFromRange } from "../utils/dateRange";

export async function getSchoolReports(req: AuthRequest, res: Response) {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School context required" });
  }

  const schoolId = req.user.schoolId;
  const range = String(req.query.range || "7d");
  const fromDate = getDateFromRange(range);

  try {
    /* ============================
       Parallel aggregation
    ============================ */
    const [studentsCount, alertsRaw, interventionsCount, counselors] =
      await Promise.all([
        prisma.student.count({ where: { schoolId } }),
        prisma.alert.findMany({
          where: { schoolId, createdAt: { gte: fromDate } },
          select: { riskLevel: true, counselorId: true },
        }),
        prisma.intervention.count({
          where: { schoolId, createdAt: { gte: fromDate } },
        }),
        prisma.counselor.findMany({
          where: { schoolId },
          select: { id: true, name: true },
        }),
      ]);

    /* ============================
       Derived stats
    ============================ */
    const alertsCount = alertsRaw.length;

    const riskLevels = ["LOW", "MEDIUM", "HIGH"] as const;
    const riskDistribution: Record<(typeof riskLevels)[number], number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
    };

    alertsRaw.forEach((a) => {
      if (riskLevels.includes(a.riskLevel as any)) {
        riskDistribution[a.riskLevel as (typeof riskLevels)[number]]++;
      }
    });

    const highRiskCount = riskDistribution.HIGH;

    /* ============================
       Counselor activity
       Optimized mapping
    ============================ */
    // Group alerts by counselorId
    const alertsByCounselor: Record<string, typeof alertsRaw> = {};
    alertsRaw.forEach((alert) => {
      if (alert.counselorId) {
        alertsByCounselor[alert.counselorId] =
          alertsByCounselor[alert.counselorId] || [];
        alertsByCounselor[alert.counselorId].push(alert);
      }
    });

    const counselorActivity = counselors.map((c) => {
      const handledAlerts = alertsByCounselor[c.id] || [];
      return {
        id: c.id,
        name: c.name,
        students: 0, // Optional metric for future
        alertsHandled: handledAlerts.length,
        interventions: handledAlerts.length, // Placeholder, replace with real interventions if available
      };
    });

    return res.status(200).json({
      studentsCount,
      highRiskCount,
      alertsCount,
      interventionsCount,
      riskDistribution,
      counselorActivity,
    });
  } catch (error) {
    console.error("getSchoolReports error:", error);
    return res.status(500).json({
      message: "Failed to fetch school reports",
    });
  }
}
