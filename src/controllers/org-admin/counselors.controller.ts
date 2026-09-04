import type { Response } from "express";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";

export const listCounselors = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const { search } = req.query as { search?: string };

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  try {
    // Find counselors in this org
    const counselors = await prisma.user.findMany({
      where: {
        orgId,
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
        assignedStudents: {
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
      studentsCount: c.assignedStudents.length,
    }));

    res.json(data);
  } catch (error) {
    console.error("List counselors error:", error);
    res.status(500).json({ message: "Failed to fetch counselors" });
  }
};


export const getCounselorProfile = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const counselorId = req.params.counselorId;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  try {
    // Fetch counselor with assigned students
    const counselor = await prisma.user.findFirst({
      where: {
        id: counselorId,
        orgId,
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
        assignedStudents: {
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
    });

    if (!counselor)
      return res.status(404).json({ message: "Counselor not found" });

    // Map students
    const students = counselor.assignedStudents.map((student) => {
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

const assignSchema = z.object({
  studentIds: z.array(z.string().uuid()),
});

/**
 * POST /org/counselors/:counselorId/assign
 * Sets this counselor's full caseload to exactly the given student IDs —
 * students already assigned but omitted from the list are unassigned, so
 * the request body represents the desired end state, not a delta.
 */
export const assignStudentsToCounselor = async (
  req: AuthRequest,
  res: Response,
) => {
  const orgId = req.user?.orgId;
  const counselorId = req.params.counselorId;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "studentIds must be an array of IDs" });
  }
  const { studentIds } = parsed.data;

  try {
    const counselor = await prisma.user.findFirst({
      where: { id: counselorId, orgId, role: { name: "COUNSELOR" } },
      select: { id: true },
    });
    if (!counselor) {
      return res.status(404).json({ message: "Counselor not found" });
    }

    await prisma.$transaction([
      // Unassign anyone currently on this counselor's caseload who isn't
      // in the new list.
      prisma.user.updateMany({
        where: { assignedCounselorId: counselorId, id: { notIn: studentIds } },
        data: { assignedCounselorId: null },
      }),
      // Assign everyone in the list — scoped to this org's students, so a
      // stray or cross-org ID is silently ignored rather than erroring.
      prisma.user.updateMany({
        where: { id: { in: studentIds }, orgId, role: { name: "STUDENT" } },
        data: { assignedCounselorId: counselorId },
      }),
    ]);

    return res.json({ message: "Caseload updated", studentsCount: studentIds.length });
  } catch (error) {
    console.error("Assign students error:", error);
    return res.status(500).json({ message: "Failed to update caseload" });
  }
};

const setActiveSchema = z.object({
  isActive: z.boolean(),
});

/**
 * PATCH /org/counselors/:counselorId/status
 * Activate/deactivate a counselor account. Deactivating does not touch
 * their assigned caseload — reassign it separately if needed.
 */
export const setCounselorActive = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const counselorId = req.params.counselorId;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const parsed = setActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "isActive must be a boolean" });
  }

  try {
    const counselor = await prisma.user.findFirst({
      where: { id: counselorId, orgId, role: { name: "COUNSELOR" } },
      select: { id: true },
    });
    if (!counselor) {
      return res.status(404).json({ message: "Counselor not found" });
    }

    await prisma.user.update({
      where: { id: counselorId },
      data: { isActive: parsed.data.isActive },
    });

    return res.json({ message: "Status updated", isActive: parsed.data.isActive });
  } catch (error) {
    console.error("Set counselor active error:", error);
    return res.status(500).json({ message: "Failed to update status" });
  }
};
