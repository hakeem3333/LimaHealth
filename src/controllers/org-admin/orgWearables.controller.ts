import type { Response } from "express";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

// A linked device with no reading in this window is flagged as not syncing.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function getOrgWearables(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const { status } = req.query as {
    status?: "connected" | "not_connected";
  };

  const students = await prisma.user.findMany({
    where: {
      orgId: req.user.orgId,
      role: { name: "STUDENT" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fitbitCredential: { select: { createdAt: true } },
      biometricLogs: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true },
      },
    },
  });

  let result = students.map((s) => {
    const lastLog = s.biometricLogs[0];
    // "Linked" means the student actually authorised a device (a stored
    // credential) — not merely that a reading exists, and never inferred
    // for someone who has not connected anything.
    const linked = Boolean(s.fitbitCredential);
    const fresh = lastLog && Date.now() - lastLog.timestamp.getTime() < STALE_AFTER_MS;

    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      device: linked ? "Fitbit" : null,
      connected: linked,
      linkStatus: !linked ? "not_linked" : fresh ? "live" : "stale",
      linkedAt: s.fitbitCredential?.createdAt ?? null,
      lastSync: lastLog?.timestamp ?? null,
    };
  });

  if (status === "connected") {
    result = result.filter((r) => r.connected);
  }

  if (status === "not_connected") {
    result = result.filter((r) => !r.connected);
  }

  return res.json(result);
}
