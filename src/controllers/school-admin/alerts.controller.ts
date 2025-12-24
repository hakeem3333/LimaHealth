import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

// Query validation schema
const alertQuerySchema = z.object({
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  page: z.string().regex(/^\d+$/).optional(), // page as string number
  limit: z.string().regex(/^\d+$/).optional(), // limit as string number
});

export const listSchoolAlerts = async (req: AuthRequest, res: Response) => {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  // Validate and parse query parameters
  const parsedQuery = alertQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({
        message: "Invalid query parameters",
        errors: parsedQuery.error.flatten(),
      });
  }

  const { severity, status, page = "1", limit = "50" } = parsedQuery.data;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  try {
    const alerts = await prisma.alert.findMany({
      where: {
        schoolId: req.user.schoolId,
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limitNumber,
      skip: (pageNumber - 1) * limitNumber,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        counselor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const formatted = alerts.map((a) => ({
      id: a.id,
      studentId: a.student?.id ?? null,
      studentName: a.student
        ? `${a.student.firstName} ${a.student.lastName}`
        : "Unknown",
      severity: a.severity,
      trigger: a.trigger,
      counselorName: a.counselor
        ? `${a.counselor.firstName} ${a.counselor.lastName}`
        : "Unknown",
      status: a.status,
      createdAt: a.createdAt,
    }));

    res
      .status(200)
      .json({ alerts: formatted, page: pageNumber, limit: limitNumber });
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    res.status(500).json({ message: "Failed to fetch alerts" });
  }
};
