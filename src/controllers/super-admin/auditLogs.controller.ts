import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

/**
 * GET /super-admin/audit-logs
 * SuperAdmin-only
 */
export async function getAuditLogs(req: AuthRequest, res: Response) {
  const { action, actorRole } = req.query;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action
        ? { action: { contains: String(action), mode: "insensitive" } }
        : {}),
      ...(actorRole ? { actorRole: String(actorRole) } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200, // safety cap
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
    actorName: `${log.actor.firstName} ${log.actor.lastName}`,
    actorRole: log.actorRole,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  }));

  return res.json(response);
}
