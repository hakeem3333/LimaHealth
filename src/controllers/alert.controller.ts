import type { Response } from "express";
import prisma from "../services/prisma.service";
import type { AuthRequest } from "../middleware/auth.middleware";
import { sendPushNotification } from "../services/pushNotification.service";
import { sendEmail } from "../services/email.service";
import { z } from "zod";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2 };

const panicSchema = z.object({
  message: z.string().max(500).optional(),
});

const PANIC_COOLDOWN_MINUTES = 2;

const alertSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  alertType: z.string().min(1, "Alert type is required"),
  message: z.string().min(1, "Message is required"),
  severity: z.enum(["CRITICAL", "HIGH", "MODERATE"]).default("HIGH"),
  notes: z.string().optional(),
});

const updateAlertSchema = z.object({
  message: z.string().min(1).optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MODERATE"]).optional(),
  isResolved: z.boolean().optional(),
  notes: z.string().optional(),
});

const includeParties = {
  student: { select: { id: true, firstName: true, lastName: true, email: true } },
  counselor: { select: { id: true, firstName: true, lastName: true, email: true } },
};

function sortBySeverityThenTime<T extends { severity: string; timestamp: Date }>(alerts: T[]) {
  return [...alerts].sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (rankDiff !== 0) return rankDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

// GET /alerts — scoped to the caller: a counselor sees alerts on their
// caseload, a student sees only their own.
export const getAllAlerts = async (req: AuthRequest, res: Response) => {
  const { id: userId, role } = req.user!;

  const where =
    role === "COUNSELOR" ? { counselorId: userId } : { studentId: userId };

  try {
    const alerts = await prisma.alert.findMany({ where, include: includeParties });
    res.status(200).json(sortBySeverityThenTime(alerts));
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /alerts/:id — only the assigned counselor or the alert's own student
// may view it.
export const getAlertById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { id: userId } = req.user!;

  try {
    const alert = await prisma.alert.findFirst({
      where: { id, OR: [{ counselorId: userId }, { studentId: userId }] },
      include: includeParties,
    });

    if (!alert) return res.status(404).json({ message: "Alert not found" });
    res.status(200).json(alert);
  } catch (error) {
    console.error("Error fetching alert by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /alerts — a counselor raises an alert about a student on their own
// caseload. counselorId always comes from the token, never the request body.
export const createAlert = async (req: AuthRequest, res: Response) => {
  const counselorId = req.user!.id;

  try {
    const parsed = alertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const student = await prisma.user.findFirst({
      where: {
        id: parsed.data.studentId,
        assignedCounselorId: counselorId,
        role: { name: "STUDENT" },
      },
      select: { id: true },
    });
    if (!student) {
      return res.status(403).json({ message: "This student is not on your caseload" });
    }

    const newAlert = await prisma.alert.create({
      data: { ...parsed.data, counselorId },
      include: includeParties,
    });
    res.status(201).json(newAlert);

    void sendPushNotification(
      parsed.data.studentId,
      "Your counselor flagged a concern",
      parsed.data.message,
      { type: "alert", alertId: newAlert.id, severity: newAlert.severity },
    );
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /alerts/panic — the panic button. A student/member signals they need
// immediate help; routed to their assigned counselor, falling back to any
// active counselor in their organisation if none is assigned. Repeated taps
// within the cooldown window return the existing alert instead of spamming
// new notifications.
export const triggerPanicAlert = async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;

  try {
    const parsed = panicSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, orgId: true, assignedCounselorId: true },
    });
    if (!student) return res.status(404).json({ message: "User not found" });

    let counselorId = student.assignedCounselorId;
    if (!counselorId && student.orgId) {
      const fallback = await prisma.user.findFirst({
        where: { orgId: student.orgId, isActive: true, role: { name: "COUNSELOR" } },
        select: { id: true },
      });
      counselorId = fallback?.id ?? null;
    }

    if (!counselorId) {
      return res.status(422).json({
        message:
          "No counselor is available to notify right now. If this is an emergency, please contact local emergency services.",
      });
    }

    // Repeated taps (double-press, retry) reuse the same unresolved alert
    // instead of firing duplicate pushes/emails at the counselor.
    const since = new Date(Date.now() - PANIC_COOLDOWN_MINUTES * 60 * 1000);
    const recent = await prisma.alert.findFirst({
      where: { studentId, alertType: "PANIC_BUTTON", isResolved: false, createdAt: { gte: since } },
      include: includeParties,
    });
    if (recent) {
      res.status(200).json(recent);
      return;
    }

    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const note = parsed.data.message?.trim();
    const message = note
      ? `${studentName} pressed the panic button: "${note}"`
      : `${studentName} pressed the panic button and needs immediate support.`;

    const newAlert = await prisma.alert.create({
      data: {
        studentId,
        counselorId,
        alertType: "PANIC_BUTTON",
        severity: "CRITICAL",
        message,
      },
      include: includeParties,
    });

    res.status(201).json(newAlert);

    void sendPushNotification(
      counselorId,
      "🚨 Panic Button Alert",
      message,
      { type: "alert", alertId: newAlert.id, severity: "CRITICAL", alertType: "PANIC_BUTTON" },
    );

    void sendEmail({
      to: newAlert.counselor.email,
      subject: `[LimaHealth URGENT] ${studentName} pressed the panic button`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
          <h2 style="color:#DC2626">🚨 Panic Button Pressed</h2>
          <p>${message}</p>
          <p>Please reach out to ${studentName} immediately.</p>
          <p style="color:#6B7280;font-size:12px">— LimaHealth Automated Monitoring</p>
        </div>
      `,
    }).catch((err: any) => {
      console.error("[Panic Alert] Email failed:", err.message);
    });
  } catch (error) {
    console.error("Error triggering panic alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /alerts/:id/resolve — the assigned counselor or the alert's own
// student can mark it resolved (the student mobile app already relies on
// self-resolving critical alerts).
export const resolveAlert = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { id: userId } = req.user!;

  try {
    const alert = await prisma.alert.findFirst({
      where: { id, OR: [{ counselorId: userId }, { studentId: userId }] },
    });
    if (!alert) return res.status(404).json({ message: "Alert not found" });

    const updated = await prisma.alert.update({
      where: { id },
      data: { isResolved: true },
      include: includeParties,
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error resolving alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /alerts/:id — only the assigned counselor may edit an alert's details.
export const updateAlert = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const counselorId = req.user!.id;

  try {
    const parsed = updateAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const existing = await prisma.alert.findFirst({ where: { id, counselorId } });
    if (!existing) return res.status(404).json({ message: "Alert not found" });

    const updatedAlert = await prisma.alert.update({
      where: { id },
      data: parsed.data,
      include: includeParties,
    });
    res.status(200).json(updatedAlert);
  } catch (error) {
    console.error("Error updating alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /alerts/:id — only the assigned counselor may delete an alert.
export const deleteAlert = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const counselorId = req.user!.id;

  try {
    const existing = await prisma.alert.findFirst({ where: { id, counselorId } });
    if (!existing) return res.status(404).json({ message: "Alert not found" });

    await prisma.alert.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
