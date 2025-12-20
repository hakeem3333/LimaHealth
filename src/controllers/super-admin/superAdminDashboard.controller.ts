import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

/**
 * GET /super-admin/dashboard
 * SuperAdmin-only platform stats
 */
export async function getSuperAdminDashboard(req: AuthRequest, res: Response) {
  // Parallelized counts for speed
  const [schoolsCount, studentsCount, adminsCount, alertsCount] =
    await Promise.all([
      prisma.school.count(),

      prisma.user.count({
        where: {
          role: {
            name: "STUDENT",
          },
        },
      }),

      prisma.user.count({
        where: {
          role: {
            name: {
              in: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
            },
          },
        },
      }),

      prisma.alert.count({
        where: {
          isResolved: false,
        },
      }),
    ]);

  return res.json({
    schoolsCount,
    studentsCount,
    adminsCount,
    alertsCount,
  });
}
