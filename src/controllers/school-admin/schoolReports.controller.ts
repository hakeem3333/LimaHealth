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

  /* ============================
     Parallel aggregation
  ============================ */
  const [studentsCount, alerts, interventionsCount, counselors] =
    await Promise.all([
      prisma.student.count({
        where: { schoolId },
      }),

      prisma.alert.findMany({
        where: {
          schoolId,
          createdAt: { gte: fromDate },
        },
        select: {
          riskLevel: true,
          counselorId: true,
        },
      }),

      prisma.intervention.count({
        where: {
          schoolId,
          createdAt: { gte: fromDate },
        },
      }),

      prisma.counselor.findMany({
        where: { schoolId },
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
