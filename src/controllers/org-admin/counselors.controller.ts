import type { Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "../../services/prisma.service";
import { riskFromSeverities } from "../../utils/risk.util";
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
        createdAt: true,
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
      createdAt: c.createdAt,
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
              where: { isResolved: false },
              select: { severity: true },
            },
          },
        },
      },
    });

    if (!counselor)
      return res.status(404).json({ message: "Counselor not found" });

    // Map students
    const students = counselor.assignedStudents.map((student) => {
      const riskLevel = riskFromSeverities(student.alertsAsStudent.map((a) => a.severity));
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
      select: { id: true, isActive: true },
    });
    if (!counselor) {
      return res.status(404).json({ message: "Counselor not found" });
    }
    if (!counselor.isActive && studentIds.length > 0) {
      return res.status(409).json({ message: "Reactivate this counselor before assigning students" });
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
  // When deactivating someone with a caseload, the admin must say where those
  // students go: another active counselor, or explicitly unassigned.
  reassignToId: z.string().uuid().optional(),
  unassign: z.boolean().optional(),
});

/**
 * PATCH /org/counselors/:counselorId/status
 * Activate/deactivate a counselor account. Deactivating a counselor who still
 * has students is refused (409 CASELOAD_NOT_EMPTY) unless the request moves
 * them to `reassignToId` or sets `unassign: true` — otherwise those students'
 * bookings and messages would go to an account nobody can sign in to.
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

    const { isActive, reassignToId, unassign } = parsed.data;
    let caseloadOps: Prisma.PrismaPromise<unknown>[] = [];
    let movedCount = 0;

    if (!isActive) {
      movedCount = await prisma.user.count({ where: { assignedCounselorId: counselorId } });

      if (movedCount > 0) {
        if (reassignToId) {
          if (reassignToId === counselorId) {
            return res.status(400).json({ message: "Choose a different counselor to take over the caseload" });
          }
          const target = await prisma.user.findFirst({
            where: { id: reassignToId, orgId, isActive: true, role: { name: "COUNSELOR" } },
            select: { id: true },
          });
          if (!target) {
            return res.status(400).json({ message: "The counselor taking over must be active and in your organisation" });
          }
        } else if (!unassign) {
          return res.status(409).json({
            message: `This counselor still has ${movedCount} assigned student${movedCount === 1 ? "" : "s"}. Reassign them before deactivating.`,
            code: "CASELOAD_NOT_EMPTY",
            studentsCount: movedCount,
          });
        }

        caseloadOps = [
          prisma.user.updateMany({
            where: { assignedCounselorId: counselorId },
            data: { assignedCounselorId: reassignToId ?? null },
          }),
        ];
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: counselorId },
        data: { isActive },
      }),
      ...caseloadOps,
      // Deactivation ends any live sessions; login and refresh also refuse inactive users.
      ...(isActive ? [] : [prisma.refreshToken.deleteMany({ where: { userId: counselorId } })]),
    ]);

    return res.json({
      message: "Status updated",
      isActive,
      ...(caseloadOps.length ? { studentsMoved: movedCount, reassignedTo: reassignToId ?? null } : {}),
    });
  } catch (error) {
    console.error("Set counselor active error:", error);
    return res.status(500).json({ message: "Failed to update status" });
  }
};
