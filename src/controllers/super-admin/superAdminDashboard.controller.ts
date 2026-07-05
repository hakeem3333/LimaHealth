import type { Response } from "express";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

// Ideally shared across the app
const ROLES = {
  STUDENT: "STUDENT",
  ORG_ADMIN: "ORG_ADMIN",
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
      organisationsCount,
      membersCount,
      orgAdminsCount,
      unresolvedAlertsCount,
    ] = await Promise.all([
      prisma.organisation.count(),

      prisma.user.count({
        where: {
          role: { name: ROLES.STUDENT },
        },
      }),

      prisma.user.count({
        where: {
          role: { name: ROLES.ORG_ADMIN },
        },
      }),

      prisma.alert.count({
        where: {
          isResolved: false,
        },
      }),
    ]);

    return res.json({
      organisationsCount,
      membersCount,
      orgAdminsCount,
      unresolvedAlertsCount,
    });
  } catch (error) {
    console.error("Failed to load super admin dashboard:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
