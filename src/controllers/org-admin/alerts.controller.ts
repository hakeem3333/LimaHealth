import type { Response } from "express";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { z } from "zod";

// Alert only tracks a boolean isResolved (see prisma/models/Alert.prisma) —
// there's no "acknowledged" tri-state anywhere in the schema or in the
// counselor/student-facing alert flows (alert.controller.ts), so this admin
// view maps status onto just the two real states it actually has.
export const listSchoolAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId)
      return res.status(403).json({ message: "Organisation access required" });

    const { severity, status } = req.query as {
      severity?: string;
      status?: string;
    };

    const isResolved =
      status === "RESOLVED" ? true : status === "OPEN" ? false : undefined;

    const alerts = await prisma.alert.findMany({
      where: {
        student: { orgId },
        ...(severity ? { severity: severity.toUpperCase() } : {}),
        ...(isResolved !== undefined ? { isResolved } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        counselor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const formatted = alerts.map((a) => ({
      id: a.id,
      memberId: a.student?.id,
      studentName: a.student
        ? `${a.student.firstName} ${a.student.lastName}`
        : "Unknown",
      severity: a.severity,
      trigger: a.message,
      counselorName: a.counselor
        ? `${a.counselor.firstName} ${a.counselor.lastName}`
        : null,
      status: a.isResolved ? "RESOLVED" : "OPEN",
      createdAt: a.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    res.status(500).json({ message: "Failed to fetch alerts" });
  }
};

// GET /org/alerts/:id — org-scoped detail view, powers the alert detail page.
export const getSchoolAlertById = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId)
      return res.status(403).json({ message: "Organisation access required" });

    const { id } = req.params;

    const alert = await prisma.alert.findFirst({
      where: { id, student: { orgId } },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        counselor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!alert) return res.status(404).json({ message: "Alert not found" });

    res.json({
      id: alert.id,
      memberId: alert.student.id,
      studentName: `${alert.student.firstName} ${alert.student.lastName}`,
      studentEmail: alert.student.email,
      severity: alert.severity,
      alertType: alert.alertType,
      trigger: alert.message,
      notes: alert.notes,
      counselorName: `${alert.counselor.firstName} ${alert.counselor.lastName}`,
      counselorEmail: alert.counselor.email,
      status: alert.isResolved ? "RESOLVED" : "OPEN",
      timestamp: alert.timestamp,
      createdAt: alert.createdAt,
    });
  } catch (error) {
    console.error("Failed to fetch alert:", error);
    res.status(500).json({ message: "Failed to fetch alert" });
  }
};

const updateStatusSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]),
});

// PATCH /org/alerts/:id — org-scoped so one school can't touch another's alert.
export const updateSchoolAlertStatus = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId)
      return res.status(403).json({ message: "Organisation access required" });

    const { id } = req.params;
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "status must be OPEN or RESOLVED" });
    }

    const existing = await prisma.alert.findFirst({
      where: { id, student: { orgId } },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Alert not found" });

    await prisma.alert.update({
      where: { id },
      data: { isResolved: parsed.data.status === "RESOLVED" },
    });

    res.json({ id, status: parsed.data.status });
  } catch (error) {
    console.error("Failed to update alert:", error);
    res.status(500).json({ message: "Failed to update alert" });
  }
};
