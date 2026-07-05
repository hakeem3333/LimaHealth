// controllers/orgReports.controller.ts
import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../types/models";
import { getDateFromRange } from "../../utils/dateRange";

export async function getOrgReports(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const orgId = req.user.orgId;
  const range = String(req.query.range || "7d");
  const fromDate = getDateFromRange(range);

  /* ============================
     Parallel aggregation
  ============================ */
  const [studentsCount, alerts, interventionsCount, counselors] =
    await Promise.all([
      prisma.student.count({
        where: { orgId },
      }),

      prisma.alert.findMany({
        where: {
          orgId,
          createdAt: { gte: fromDate },
        },
        select: {
          riskLevel: true,
          counselorId: true,
        },
      }),

      prisma.intervention.count({
        where: {
          orgId,
          createdAt: { gte: fromDate },
        },
      }),

      prisma.counselor.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

  /* ============================
     Derived stats
  ============================ */
  const alertsCount = alerts.length;

  const riskDistribution = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  alerts.forEach((a) => {
    riskDistribution[a.riskLevel]++;
  });

  const highRiskCount = riskDistribution.HIGH;

  /* ============================
     Counselor activity
  ============================ */
  const counselorActivity = counselors.map((c) => {
    const counselorAlerts = alerts.filter((a) => a.counselorId === c.id);

    return {
      id: c.id,
      name: c.name,
      students: 0, // optional future metric
      alertsHandled: counselorAlerts.length,
      interventions: counselorAlerts.filter((a) => a.counselorId).length,
    };
  });

  return res.json({
    studentsCount,
    highRiskCount,
    alertsCount,
    interventionsCount,
    riskDistribution,
    counselorActivity,
  });
}
