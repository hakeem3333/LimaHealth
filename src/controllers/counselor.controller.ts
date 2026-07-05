import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";

// ---------------------------------------------------------------------------
// GET /counselor/dashboard
// Returns today's appointments + priority students (those with recent alerts)
// ---------------------------------------------------------------------------
export const getCounselorDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const counselorId = req.user!.id;
    const orgId    = req.user!.orgId!;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [todayAppointments, unresolvedAlerts, recentMoods, counselor] = await Promise.all([
      // Today's sessions
      prisma.appointment.findMany({
        where: {
          counselorId,
          startTime: { gte: startOfDay, lte: endOfDay },
          status: { not: "CANCELLED" },
        },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { startTime: "asc" },
      }),

      // Unresolved alerts for members at this org
      prisma.alert.findMany({
        where: {
          isResolved: false,
          student: { orgId },
        },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      // Recent negative mood logs at this org
      prisma.moodLog.findMany({
        where: {
          moodEmoji: { in: ["AWFUL", "DOWN", "LOW"] },
          user: { orgId },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Counselor's own availability
      prisma.user.findUnique({
        where: { id: counselorId },
        select: { isAvailable: true },
      }),
    ]);

    // Build priority student list from alerts
    const studentAlertMap = new Map<string, { name: string; severity: string; alertType: string; time: Date }>();
    for (const alert of unresolvedAlerts) {
      const sid = alert.studentId;
      const existing = studentAlertMap.get(sid);
      // Keep highest severity
      if (!existing || alert.severity === "CRITICAL") {
        studentAlertMap.set(sid, {
          name: `${alert.student.firstName} ${alert.student.lastName}`,
          severity: alert.severity ?? "HIGH",
          alertType: alert.alertType,
          time: alert.createdAt,
        });
      }
    }

    const priorityStudents = Array.from(studentAlertMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      severity: data.severity,
      alertType: data.alertType,
      time: data.time,
    }));

    // Recent reflections (negative mood logs)
    const recentReflections = recentMoods.map((log) => ({
      id: log.id,
      student: `${log.user.firstName} ${log.user.lastName}`,
      studentId: log.userId,
      mood: log.moodEmoji,
      notes: log.notes ?? null,
      time: log.createdAt,
    }));

    return res.json({
      success: true,
      data: {
        isAvailable:       counselor?.isAvailable ?? true,
        todayAppointments: todayAppointments.map((a) => ({
          id:        a.id,
          student:   `${a.student.firstName} ${a.student.lastName}`,
          studentId: a.studentId,
          startTime: a.startTime,
          endTime:   a.endTime,
          status:    a.status,
          reason:    a.reason ?? null,
        })),
        priorityStudents,
        recentReflections,
      },
    });
  } catch (error) {
    console.error("Counselor Dashboard Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /counselor/students — all members at this org
// ---------------------------------------------------------------------------
export const getStudentsAtRisk = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    if (!orgId) return res.status(403).json({ error: "No organisation context" });

    const students = await prisma.user.findMany({
      where: { orgId, role: { name: "STUDENT" }, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        alertsAsStudent: {
          where: { isResolved: false },
          select: { severity: true, alertType: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { firstName: "asc" },
    });

    return res.json({
      success: true,
      data: students.map((s) => ({
        id:        s.id,
        name:      `${s.firstName} ${s.lastName}`,
        email:     s.email,
        latestAlert: s.alertsAsStudent[0] ?? null,
      })),
    });
  } catch (error) {
    console.error("Get Students Error:", error);
    return res.status(500).json({ error: "Failed to fetch students" });
  }
};

// ---------------------------------------------------------------------------
// GET /counselor/students/:id — individual student deep-dive
// ---------------------------------------------------------------------------
export const getStudentDetails = async (req: AuthRequest, res: Response) => {
  const studentId = req.params.id;
  if (!studentId) return res.status(400).json({ message: "Student ID required" });

  try {
    const student = await prisma.user.findFirst({
      where: { id: studentId, orgId: req.user!.orgId, role: { name: "STUDENT" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        moodLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, moodEmoji: true, notes: true, createdAt: true },
        },
        biometricLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, heartRate: true, stressLevelScore: true, gsr: true, movement: true, createdAt: true },
        },
        alertsAsStudent: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, alertType: true, severity: true, message: true, createdAt: true },
        },
      },
    });

    if (!student) return res.status(404).json({ message: "Student not found" });

    return res.json({ success: true, data: student });
  } catch (error) {
    console.error("Get Student Details Error:", error);
    return res.status(500).json({ error: "Failed to fetch student details" });
  }
};
