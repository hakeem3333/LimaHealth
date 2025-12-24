import { Response } from "express";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

// Query schema for listCounselors
const listCounselorsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export const listCounselors = async (req: AuthRequest, res: Response) => {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  const parsedQuery = listCounselorsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      message: "Invalid query parameters",
      errors: parsedQuery.error.flatten(),
    });
  }

  const { search, page = "1", limit = "50" } = parsedQuery.data;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  try {
    const counselors = await prisma.user.findMany({
      where: {
        schoolId: req.user.schoolId,
        role: { name: "COUNSELOR" },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        alertsAsCounselor: {
          select: { studentId: true },
          distinct: ["studentId"],
        },
      },
      orderBy: { firstName: "asc" },
      take: limitNumber,
      skip: (pageNumber - 1) * limitNumber,
    });

    const data = counselors.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      isActive: c.isActive,
      studentsCount: c.alertsAsCounselor.length,
    }));

    res
      .status(200)
      .json({ counselors: data, page: pageNumber, limit: limitNumber });
  } catch (error) {
    console.error("List counselors error:", error);
    res.status(500).json({ message: "Failed to fetch counselors" });
  }
};

// Query schema for getCounselorProfile
const counselorParamsSchema = z.object({
  counselorId: z.string().uuid(),
});

export const getCounselorProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  const parsedParams = counselorParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      message: "Invalid counselor ID",
      errors: parsedParams.error.flatten(),
    });
  }

  const { counselorId } = parsedParams.data;

  try {
    const counselor = await prisma.user.findFirst({
      where: {
        id: counselorId,
        schoolId: req.user.schoolId,
        role: { name: "COUNSELOR" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        alertsAsCounselor: {
          where: { isResolved: false },
          select: { id: true, createdAt: true, studentId: true },
        },
        studentOf: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                isActive: true,
                alertsAsStudent: {
                  select: {
                    alertType: true,
                    isResolved: true,
                    createdAt: true,
                  },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
                biometricLogs: {
                  select: { timestamp: true },
                  orderBy: { timestamp: "desc" },
                  take: 1,
                },
                moodLogs: {
                  select: { timestamp: true },
                  orderBy: { timestamp: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!counselor) {
      return res.status(404).json({ message: "Counselor not found" });
    }

    // Map students
    const students = counselor.studentOf.map(({ student }) => {
      const latestAlert = student.alertsAsStudent[0];
      const riskLevel = latestAlert?.alertType.toUpperCase() ?? "LOW";
      const wearableConnected = student.biometricLogs.length > 0;

      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        riskLevel,
        wearableConnected,
      };
    });

    // Determine last activity timestamp
    const lastActivityTimestamps = [
      ...counselor.alertsAsCounselor.map((a) => a.createdAt),
      ...counselor.studentOf.flatMap(({ student }) => [
        ...(student.biometricLogs.map((b) => b.timestamp) ?? []),
        ...(student.moodLogs.map((m) => m.timestamp) ?? []),
        ...(student.alertsAsStudent.map((a) => a.createdAt) ?? []),
      ]),
    ];
    const lastActivity =
      lastActivityTimestamps.length > 0
        ? new Date(
            Math.max(
              ...lastActivityTimestamps.map((d) => new Date(d).getTime())
            )
          ).toISOString()
        : null;

    // Map interventions (simplified placeholder using alertsAsCounselor)
    const interventions = counselor.alertsAsCounselor.map((a, index) => ({
      id: a.id,
      studentName: students[index]?.name ?? "Student",
      note: "Follow up required",
      createdAt: a.createdAt,
    }));

    res.status(200).json({
      id: counselor.id,
      name: `${counselor.firstName} ${counselor.lastName}`,
      email: counselor.email,
      isActive: counselor.isActive,
      students,
      activeAlerts: counselor.alertsAsCounselor.length,
      lastActivity,
      interventions,
    });
  } catch (error) {
    console.error("Counselor profile error:", error);
    res.status(500).json({ message: "Failed to fetch counselor profile" });
  }
};
