import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

/**
 * GET /super-admin/audit-logs
 * SuperAdmin-only
 */
export async function getAuditLogs(req: AuthRequest, res: Response) {
  try {
    // 🔐 Enforce SuperAdmin access
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { action, actorRole, page = "1", limit = "50" } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.min(Number(limit), 200); // safety cap

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(action
          ? {
              action: {
                contains: String(action).trim(),
                mode: "insensitive",
              },
            }
          : {}),
        ...(actorRole ? { actorRole: String(actorRole) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
      include: {
        actor: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const response = logs.map((log) => ({
      id: log.id,
      actorName: log.actor
        ? `${log.actor.firstName} ${log.actor.lastName}`
        : "System",
      actorRole: log.actorRole,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));

    return res.json({
      page: pageNumber,
      limit: pageSize,
      count: response.length,
      data: response,
    });
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
