import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../types/auth.types";
import prisma from "../services/prisma.service";

// Zod schema for query validation
const getWearablesQuerySchema = z.object({
  status: z.enum(["connected", "not_connected"]).optional(),
});

export async function getSchoolWearables(req: AuthRequest, res: Response) {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School context required" });
  }

  // Validate query parameters
  const parsedQuery = getWearablesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      message: "Invalid query parameters",
      errors: parsedQuery.error.flatten(),
    });
  }

  const { status } = parsedQuery.data;
  const schoolId = req.user.schoolId;

  try {
    // Fetch students and their latest biometric log
    let students = await prisma.user.findMany({
      where: { schoolId, role: { name: "STUDENT" } },
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

    // Map students to wearable info
    let result = students.map((s) => {
      const lastLog = s.biometricLogs[0];
      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        device: lastLog ? "Fitbit" : null, // Placeholder, replace with real device if available
        connected: Boolean(lastLog),
        lastSync: lastLog?.timestamp ?? null,
      };
    });

    // Apply status filter if provided
    if (status === "connected") {
      result = result.filter((r) => r.connected);
    } else if (status === "not_connected") {
      result = result.filter((r) => !r.connected);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("getSchoolWearables error:", error);
    return res.status(500).json({ message: "Failed to fetch wearable data" });
  }
}
