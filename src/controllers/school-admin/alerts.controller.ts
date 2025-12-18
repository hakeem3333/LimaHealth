import type { Request, Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const listSchoolAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId)
      return res.status(403).json({ message: "School access required" });

    const { severity, status } = req.query as {
      severity?: string;
      status?: string;
    };

    const alerts = await prisma.alert.findMany({
      where: {
        schoolId,
        ...(severity ? { severity: severity.toUpperCase() } : {}),
        ...(status ? { status: status.toUpperCase() } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        counselor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const formatted = alerts.map((a) => ({
      id: a.id,
      studentId: a.student?.id,
      studentName: a.student
        ? `${a.student.firstName} ${a.student.lastName}`
        : "Unknown",
      severity: a.severity,
      trigger: a.trigger,
      counselorName: a.counselor
        ? `${a.counselor.firstName} ${a.counselor.lastName}`
        : null,
      status: a.status,
      createdAt: a.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    res.status(500).json({ message: "Failed to fetch alerts" });
  }
};
