import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /counselor/dashboard
// Returns today's appointments + priority students (those with recent alerts)
// — scoped to this counselor's own assigned caseload, not the whole org.
// ---------------------------------------------------------------------------
export const getCounselorDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const counselorId = req.user!.id;
    const orgId    = req.user!.orgId!;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [todayAppointments, unresolvedAlerts, recentMoods, counselor, caseloadCount] = await Promise.all([
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

      // Unresolved alerts for this counselor's assigned caseload
      prisma.alert.findMany({
        where: {
          isResolved: false,
          student: { orgId, assignedCounselorId: counselorId },
        },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      // Recent negative mood logs from this counselor's assigned caseload
      prisma.moodLog.findMany({
        where: {
          moodEmoji: { in: ["AWFUL", "DOWN", "LOW"] },
          user: { orgId, assignedCounselorId: counselorId },
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

      // Total caseload size
      prisma.user.count({
        where: { orgId, assignedCounselorId: counselorId, role: { name: "STUDENT" } },
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
        caseloadCount,
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
// GET /counselor/students — this counselor's own assigned caseload
// ---------------------------------------------------------------------------
export const getStudentsAtRisk = async (req: AuthRequest, res: Response) => {
  try {
    const counselorId = req.user!.id;
    const orgId = req.user!.orgId;
    if (!orgId) return res.status(403).json({ error: "No organisation context" });

    const students = await prisma.user.findMany({
      where: { orgId, assignedCounselorId: counselorId, role: { name: "STUDENT" }, isActive: true },
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
        biometricLogs: {
          select: { timestamp: true },
          orderBy: { timestamp: "desc" },
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
        wearableConnected: Boolean(
          s.biometricLogs[0] && s.biometricLogs[0].timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000),
        ),
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
  const counselorId = req.user!.id;
  if (!studentId) return res.status(400).json({ message: "Student ID required" });

  try {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        orgId: req.user!.orgId,
        assignedCounselorId: counselorId,
        role: { name: "STUDENT" },
      },
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
        counselorNotesAboutMe: {
          where: { counselorId },
          orderBy: { createdAt: "desc" },
          select: { id: true, content: true, createdAt: true },
        },
      },
    });

    if (!student) return res.status(404).json({ message: "Student not found" });

    const { counselorNotesAboutMe, ...rest } = student;

    return res.json({ success: true, data: { ...rest, notes: counselorNotesAboutMe } });
  } catch (error) {
    console.error("Get Student Details Error:", error);
    return res.status(500).json({ error: "Failed to fetch student details" });
  }
};

const noteSchema = z.object({
  content: z.string().trim().min(1, "Note cannot be empty").max(4000),
});

// ---------------------------------------------------------------------------
// POST /counselor/students/:id/notes — add a private clinical note
// ---------------------------------------------------------------------------
export const addStudentNote = async (req: AuthRequest, res: Response) => {
  const studentId = req.params.id;
  const counselorId = req.user!.id;

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  try {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        orgId: req.user!.orgId,
        assignedCounselorId: counselorId,
        role: { name: "STUDENT" },
      },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const note = await prisma.counselorNote.create({
      data: { counselorId, studentId, content: parsed.data.content },
      select: { id: true, content: true, createdAt: true },
    });

    return res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error("Add Student Note Error:", error);
    return res.status(500).json({ error: "Failed to save note" });
  }
};

// ---------------------------------------------------------------------------
// GET /counselor/notes — recent notes across the whole caseload, newest
// first, so a counselor can catch up without opening each student one by one.
// ---------------------------------------------------------------------------
export const getRecentNotes = async (req: AuthRequest, res: Response) => {
  const counselorId = req.user!.id;

  try {
    const notes = await prisma.counselorNote.findMany({
      where: { counselorId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return res.json({
      success: true,
      data: notes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        studentId: n.student.id,
        studentName: `${n.student.firstName} ${n.student.lastName}`,
      })),
    });
  } catch (error) {
    console.error("Get Recent Notes Error:", error);
    return res.status(500).json({ error: "Failed to fetch notes" });
  }
};

const MOOD_SCORE: Record<string, number> = { AWFUL: 1, LOW: 2, OKAY: 3, GOOD: 4, GREAT: 5 };

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// ---------------------------------------------------------------------------
// GET /counselor/students/:id/insights
// Rule-based trend summary computed from this student's own recent data —
// no external AI call. Compares the last 7 days against the 7 before that
// for mood, stress, and alert volume, and flags a gap in check-ins.
// ---------------------------------------------------------------------------
export const getStudentInsights = async (req: AuthRequest, res: Response) => {
  const counselorId = req.user!.id;
  const studentId = req.params.id;

  try {
    const student = await prisma.user.findFirst({
      where: { id: studentId, assignedCounselorId: counselorId, role: { name: "STUDENT" } },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [moodLogs, biometricLogs, recentAlerts, priorAlerts] = await Promise.all([
      prisma.moodLog.findMany({
        where: { userId: studentId, timestamp: { gte: fourteenDaysAgo } },
        select: { moodEmoji: true, timestamp: true },
      }),
      prisma.biometricLog.findMany({
        where: { userId: studentId, timestamp: { gte: fourteenDaysAgo } },
        select: { stressLevelScore: true, timestamp: true },
      }),
      prisma.alert.count({ where: { studentId, createdAt: { gte: sevenDaysAgo } } }),
      prisma.alert.count({ where: { studentId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    ]);

    const avgMoodRecent = average(
      moodLogs.filter((m) => m.timestamp >= sevenDaysAgo).map((m) => MOOD_SCORE[m.moodEmoji] ?? 3),
    );
    const avgMoodPrior = average(
      moodLogs.filter((m) => m.timestamp < sevenDaysAgo).map((m) => MOOD_SCORE[m.moodEmoji] ?? 3),
    );
    const avgStressRecent = average(
      biometricLogs.filter((b) => b.timestamp >= sevenDaysAgo).map((b) => b.stressLevelScore),
    );
    const avgStressPrior = average(
      biometricLogs.filter((b) => b.timestamp < sevenDaysAgo).map((b) => b.stressLevelScore),
    );

    const lastActivity = [...moodLogs, ...biometricLogs]
      .map((r) => r.timestamp)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const daysSinceCheckIn = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const findings: string[] = [];

    if (avgMoodRecent != null && avgMoodPrior != null) {
      const delta = avgMoodRecent - avgMoodPrior;
      if (delta <= -0.6) findings.push("Mood has declined noticeably compared to last week.");
      else if (delta >= 0.6) findings.push("Mood has improved compared to last week.");
    }

    if (avgStressRecent != null && avgStressPrior != null && avgStressPrior > 0) {
      const pctChange = ((avgStressRecent - avgStressPrior) / avgStressPrior) * 100;
      if (pctChange >= 20) findings.push(`Stress levels are trending up (+${Math.round(pctChange)}% vs last week).`);
      else if (pctChange <= -20) findings.push(`Stress levels are trending down (${Math.round(pctChange)}% vs last week).`);
    }

    if (daysSinceCheckIn == null) {
      findings.push("No wellness data recorded yet.");
    } else if (daysSinceCheckIn >= 3) {
      findings.push(`No check-in for ${daysSinceCheckIn} days.`);
    }

    if (recentAlerts > 0) {
      findings.push(
        `${recentAlerts} new risk alert${recentAlerts > 1 ? "s" : ""} this week` +
          (priorAlerts > 0 ? ` (vs ${priorAlerts} last week).` : "."),
      );
    }

    const summary = findings[0] ?? "No significant changes — a steady week.";
    const stats = { avgMoodRecent, avgMoodPrior, avgStressRecent, avgStressPrior, daysSinceCheckIn, recentAlerts, priorAlerts };

    // Keep a lightweight audit trail — this is the first thing that ever
    // writes to this table.
    await prisma.aIAnalysis.create({
      data: { userId: studentId, context: "weekly_trend", inputJson: stats, outputJson: { summary, findings } },
    });

    return res.json({ success: true, data: { summary, findings, stats, computedAt: new Date().toISOString() } });
  } catch (error) {
    console.error("Get Student Insights Error:", error);
    return res.status(500).json({ error: "Failed to compute insights" });
  }
};
