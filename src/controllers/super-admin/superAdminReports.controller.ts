import type { Response } from "express";
import { AuthRequest } from "../types/auth.types";
import prisma from "../services/prisma.service";

const ROLES = {
  STUDENT: "STUDENT",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const ALLOWED_RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof ALLOWED_RANGES)[number];

function getStartDate(range: Range): Date {
  const start = new Date();

  switch (range) {
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    case "30d":
    default:
      start.setDate(start.getDate() - 30);
      break;
  }

  return start;
}

/**
 * GET /super-admin/reports
 * Aggregated platform analytics (SuperAdmin-only)
 */
export async function getSuperAdminReports(req: AuthRequest, res: Response) {
  try {
    // 🔐 Enforce SuperAdmin access
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const rangeParam = String(req.query.range || "30d");
    const range: Range = ALLOWED_RANGES.includes(rangeParam as Range)
      ? (rangeParam as Range)
      : "30d";

    const startDate = getStartDate(range);

    const [
      schoolsCount,
      studentsCount,
      adminsCount,
      alertsCount,
      highRiskStudentsCount,
      wearableLinkedCount,
    ] = await Promise.all([
      prisma.school.count(),

      prisma.user.count({
        where: {
          role: { name: ROLES.STUDENT },
        },
      }),

      // School admins only (SuperAdmins excluded intentionally)
      prisma.user.count({
        where: {
          role: { name: ROLES.SCHOOL_ADMIN },
        },
      }),

      prisma.alert.count({
        where: {
          createdAt: { gte: startDate },
        },
      }),

      // High-risk students (distinct users above stress threshold)
      prisma.biometricLog.count({
        distinct: ["userId"],
        where: {
          createdAt: { gte: startDate },
          stressLevelScore: {
            gte: Number(process.env.HIGH_RISK_STRESS_THRESHOLD ?? 0.8),
          },
        },
      }),

      // Wearables linked = students with any biometric data
      prisma.biometricLog.count({
        distinct: ["userId"],
        where: {
          createdAt: { gte: startDate },
        },
      }),
    ]);

    return res.json({
      range,
      startDate,
      schools: schoolsCount,
      students: studentsCount,
      admins: adminsCount,
      alerts: alertsCount,
      highRiskStudents: highRiskStudentsCount,
      wearableLinked: wearableLinkedCount,
    });
  } catch (error) {
    console.error("Failed to load super admin reports:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
