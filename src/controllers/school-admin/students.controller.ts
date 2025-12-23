import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map alertType to risk level
 */
function mapAlertToRisk(alertType: string): "LOW" | "MEDIUM" | "HIGH" {
  if (alertType === "CRITICAL" || alertType === "HIGH") return "HIGH";
  if (alertType === "MEDIUM") return "MEDIUM";
  return "LOW";
}

export const getSchoolStudents = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  const search = (req.query.search as string) || "";
  const status = (req.query.status as string) || "all";
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);

  const isActiveFilter =
    status === "active" ? true : status === "inactive" ? false : undefined;

  try {
    // Fetch students with optional search and status filter
    const students = await prisma.user.findMany({
      where: {
        schoolId,
        role: { name: "STUDENT" },
        ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
      },
    });

    const studentIds = students.map((s) => s.id);

    // Fetch recent biometrics (last 24 hours)
    const recentBiometrics = await prisma.biometricLog.findMany({
      where: {
        userId: { in: studentIds },
        timestamp: { gte: new Date(Date.now() - ONE_DAY_MS) },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const connectedSet = new Set(recentBiometrics.map((b) => b.userId));

    // Fetch unresolved alerts
    const alerts = await prisma.alert.findMany({
      where: {
        studentId: { in: studentIds },
        isResolved: false,
      },
      orderBy: { createdAt: "desc" },
      select: {
        studentId: true,
        alertType: true,
      },
    });

    // Map latest alert per student
    const alertMap = new Map<string, string>();
    for (const alert of alerts) {
      if (!alertMap.has(alert.studentId)) {
        alertMap.set(alert.studentId, alert.alertType);
      }
    }

    // Map final results
    const results = students.map((student) => {
      const alertType = alertMap.get(student.id);
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
        isActive: student.isActive,
        wearableConnected: connectedSet.has(student.id),
        riskLevel: alertType ? mapAlertToRisk(alertType) : "LOW",
      };
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error("Get students error:", error, { schoolId, search, status });
    return res.status(500).json({ message: "Failed to load students" });
  }
};
