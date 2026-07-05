import type { Response } from "express";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

export async function getOrgWearables(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const { status } = req.query as {
    status?: "connected" | "not_connected";
  };

  // Fetch students only (users with biometric potential)
  const students = await prisma.user.findMany({
    where: {
      orgId: req.user.orgId,
      role: { name: "STUDENT" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      biometricLogs: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true },
      },
    },
  });

  let result = students.map((s) => {
    const lastLog = s.biometricLogs[0];

    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      device: lastLog ? "Fitbit" : null, // placeholder
      connected: Boolean(lastLog),
      lastSync: lastLog?.timestamp ?? null,
    };
  });

  // Apply filter
  if (status === "connected") {
    result = result.filter((r) => r.connected);
  }

  if (status === "not_connected") {
    result = result.filter((r) => !r.connected);
  }

  return res.json(result);
}
