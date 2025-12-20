import { Response } from "express";
import { AuthRequest } from "../types/auth.types";
import prisma from "../services/prisma.service";

function getStartDate(range?: string) {
  const now = new Date();

  switch (range) {
    case "7d":
      return new Date(now.setDate(now.getDate() - 7));
    case "90d":
      return new Date(now.setDate(now.getDate() - 90));
    case "30d":
    default:
      return new Date(now.setDate(now.getDate() - 30));
  }
}

/**
 * GET /super-admin/reports
 * Aggregated platform analytics
 */
export async function getSuperAdminReports(req: AuthRequest, res: Response) {
  const range = String(req.query.range || "30d");
  const startDate = getStartDate(range);

  const [schools, students, admins, alerts, highRiskStudents, wearableLinked] =
    await Promise.all([
      prisma.school.count(),

      prisma.user.count({
        where: {
          role: { name: "STUDENT" },
        },
      }),

      prisma.user.count({
        where: {
          role: {
            name: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
          },
        },
      }),

      prisma.alert.count({
        where: {
          createdAt: {
            gte: startDate,
          },
        },
      }),

      // High-risk students (based on stress score threshold)
      prisma.biometricLog
        .groupBy({
          by: ["userId"],
          where: {
            createdAt: {
              gte: startDate,
            },
            stressLevelScore: {
              gte: 0.8, // configurable later
            },
          },
        })
        .then((rows) => rows.length),

      // Wearables linked = students with any biometric data
      prisma.biometricLog
        .groupBy({
          by: ["userId"],
          where: {
            createdAt: {
              gte: startDate,
            },
          },
        })
        .then((rows) => rows.length),
    ]);

  return res.json({
    schools,
    students,
    admins,
    alerts,
    highRiskStudents,
    wearableLinked,
  });
}
