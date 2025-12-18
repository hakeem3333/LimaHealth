import type { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const listCounselors = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  const { search } = req.query as { search?: string };

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  try {
    // Find counselors in this school
    const counselors = await prisma.user.findMany({
      where: {
        schoolId,
        role: { name: "COUNSELOR" },
        OR: search
          ? [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        alertsAsCounselor: {
          select: { id: true },
        },
      },
      orderBy: { firstName: "asc" },
    });

    const data = counselors.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      isActive: c.isActive,
      studentsCount: c.alertsAsCounselor.length, // number of students assigned via alerts
    }));

    res.json(data);
  } catch (error) {
    console.error("List counselors error:", error);
    res.status(500).json({ message: "Failed to fetch counselors" });
  }
};


export const getCounselorProfile = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  const counselorId = req.params.counselorId;

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  try {
    // Fetch counselor with assigned students
    const counselor = await prisma.user.findFirst({
      where: {
        id: counselorId,
        schoolId,
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
          select: { id: true },
        },
        alertsAsStudent: {
          select: { id: true, alertType: true, createdAt: true, message: true },
        },
        studentOf: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                isActive: true,
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
                alertsAsStudent: {
                  select: { alertType: true, isResolved: true },
                },
              },
            },
          },
        },
      },
    });

    if (!counselor)
      return res.status(404).json({ message: "Counselor not found" });

    // Map students
    const students = counselor.studentOf.map(({ student }) => {
      const latestAlert = student.alertsAsStudent.slice(-1)[0];
      const riskLevel = latestAlert
        ? latestAlert.alertType.toUpperCase()
        : "LOW"; // Example
      const wearableConnected = student.biometricLogs.length > 0;
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        riskLevel,
        wearableConnected,
      };
    });

    // Determine last activity (latest timestamp from alerts, biometricLogs, moodLogs)
    const allTimestamps = [
      ...counselor.alertsAsCounselor.map((a) => a.id), // Could store timestamps if needed
    ];
    const lastActivity = allTimestamps.length ? new Date().toISOString() : null; // Simplified

    // Mock interventions from alertsAsCounselor
    const interventions = counselor.alertsAsCounselor.map((a) => ({
      id: a.id,
      studentName: students[0]?.name ?? "Student",
      note: "Follow up required", // Simplified placeholder
      createdAt: new Date().toISOString(),
    }));

    res.json({
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
