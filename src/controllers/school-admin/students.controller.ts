import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const getSchoolStudents = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  const search = (req.query.search as string) || "";
  const status = (req.query.status as string) || "all";

  const isActiveFilter =
    status === "active" ? true : status === "inactive" ? false : undefined;

  try {
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
      take: 50, // default pagination (frontend not sending page yet)
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
      },
    });

    const studentIds = students.map((s) => s.id);

    // Biometric activity (wearables)
    const recentBiometrics = await prisma.biometricLog.findMany({
      where: {
        userId: { in: studentIds },
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const connectedSet = new Set(recentBiometrics.map((b) => b.userId));

    // Latest alerts per student
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

    const alertMap = new Map<string, string>();

    for (const alert of alerts) {
      if (!alertMap.has(alert.studentId)) {
        alertMap.set(alert.studentId, alert.alertType);
      }
    }

    const results = students.map((student) => {
      const alertType = alertMap.get(student.id);

      let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

      if (alertType === "CRITICAL" || alertType === "HIGH") {
        riskLevel = "HIGH";
      } else if (alertType === "MEDIUM") {
        riskLevel = "MEDIUM";
      }

      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
        isActive: student.isActive,
        wearableConnected: connectedSet.has(student.id),
        riskLevel,
      };
    });

    return res.json(results);
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({ message: "Failed to load students" });
  }
};
