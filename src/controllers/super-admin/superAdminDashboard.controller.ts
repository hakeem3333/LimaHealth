import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

// Ideally shared across the app
const ROLES = {
  STUDENT: "STUDENT",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

/**
 * GET /super-admin/dashboard
 * SuperAdmin-only platform stats
 */
export async function getSuperAdminDashboard(req: AuthRequest, res: Response) {
  try {
    // 🔐 Enforce SuperAdmin access
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ⚡ Parallelized counts for performance
    const [
      schoolsCount,
      studentsCount,
      schoolAdminsCount,
      unresolvedAlertsCount,
    ] = await Promise.all([
      prisma.school.count(),

      prisma.user.count({
        where: {
          role: { name: ROLES.STUDENT },
        },
      }),

      prisma.user.count({
        where: {
          role: { name: ROLES.SCHOOL_ADMIN },
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
      schoolAdminsCount,
      unresolvedAlertsCount,
    });
  } catch (error) {
    console.error("Failed to load super admin dashboard:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
