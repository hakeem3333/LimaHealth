// controllers/orgReports.controller.ts
import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../types/models";
import { getDateFromRange } from "../../utils/dateRange";

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
        },
      }),
    ]);

  /* ============================
     Derived stats
  ============================ */
  const alertsCount = alerts.length;
  const interventionsCount = appointments.length;

  const riskDistribution = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  // Alert.severity is CRITICAL | HIGH | MODERATE (free-text, not an enum) —
  // map onto the LOW/MEDIUM/HIGH bands the dashboard displays.
  const SEVERITY_BAND: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
    CRITICAL: "HIGH",
    HIGH: "HIGH",
    MODERATE: "MEDIUM",
  };

  alerts.forEach((a) => {
    const band = SEVERITY_BAND[a.severity] ?? "LOW";
    riskDistribution[band]++;
  });

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
      students: activeStudents.size,
      alertsHandled: counselorAlerts.length,
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
