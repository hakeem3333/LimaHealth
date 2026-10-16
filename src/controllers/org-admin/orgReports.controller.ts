// controllers/orgReports.controller.ts
import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../types/models";
import { getDateFromRange } from "../../utils/dateRange";
import { riskFromSeverities } from "../../utils/risk.util";

export async function getOrgReports(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const orgId = req.user.orgId;
  const range = String(req.query.range || "7d");
  const fromDate = getDateFromRange(range);

  /* ============================
     Parallel aggregation
     — students/counselors are Users scoped by role, not separate models.
     — "interventions" are completed counselor Appointments; there is no
       standalone Intervention model.
  ============================ */
  const [studentsCount, alerts, appointments, counselors] =
    await Promise.all([
      prisma.user.count({
        where: { orgId, role: { name: "STUDENT" } },
      }),

      prisma.alert.findMany({
        where: {
          createdAt: { gte: fromDate },
          student: { orgId },
        },
        select: {
          severity: true,
          counselorId: true,
          studentId: true,
          isResolved: true,
        },
      }),

      prisma.appointment.findMany({
        where: {
          status: "COMPLETED",
          createdAt: { gte: fromDate },
          student: { orgId },
        },
        select: {
          counselorId: true,
          studentId: true,
        },
      }),

      prisma.user.findMany({
        where: { orgId, role: { name: "COUNSELOR" } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isActive: true,
          _count: { select: { assignedStudents: true } },
        },
      }),
    ]);

  /* ============================
     Derived stats
  ============================ */
  const alertsCount = alerts.length;
  const interventionsCount = appointments.length;

  // Each member counted once, at the worst severity they reached in the range;
  // members with no alerts are LOW. (Shown as "% of <members>", so counting
  // alerts here would double-count anyone with more than one.)
  const severitiesByStudent = new Map<string, string[]>();
  for (const a of alerts) {
    const list = severitiesByStudent.get(a.studentId) ?? [];
    list.push(a.severity);
    severitiesByStudent.set(a.studentId, list);
  }
  const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const severities of severitiesByStudent.values()) {
    riskDistribution[riskFromSeverities(severities)]++;
  }
  riskDistribution.LOW += Math.max(0, studentsCount - severitiesByStudent.size);

  const highRiskCount = alerts.filter(
    (a) => a.severity === "HIGH" || a.severity === "CRITICAL",
  ).length;

  /* ============================
     Counselor activity
  ============================ */
  const counselorActivity = counselors.map((c) => {
    const counselorAlerts = alerts.filter((a) => a.counselorId === c.id);
    const counselorAppointments = appointments.filter(
      (a) => a.counselorId === c.id,
    );
    const activeStudents = new Set([
      ...counselorAlerts.map((a) => a.studentId),
      ...counselorAppointments.map((a) => a.studentId),
    ]);

    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      isActive: c.isActive,
      // Current assigned caseload (matches the Counselors page) …
      caseload: c._count.assignedStudents,
      // … vs. distinct students this counselor dealt with in the range.
      students: activeStudents.size,
      alertsHandled: counselorAlerts.filter((a) => a.isResolved).length,
      interventions: counselorAppointments.length,
    };
  });

  return res.json({
    studentsCount,
    highRiskCount,
    alertsCount,
    interventionsCount,
    riskDistribution,
    counselorActivity,
  });
}
