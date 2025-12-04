import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../services/prisma.service";
import { z } from "zod";

// Validate user input
const studentIdSchema = z.object({
  id: z.string().transform(Number).refine(n => !isNaN(n), "Invalid student ID"),
});

// =============================
// Get all students at the school
// =============================
export const getStudentsAtRisk = async (req: AuthRequest, res: Response) => {
  try {
    const { schoolId, role } = req.user || {};

    if (!schoolId) return res.status(403).json({ error: "No school context" });

    // Optional: restrict who can view this
    if (!["COUNSELOR", "TEACHER"].includes(role))
      return res.status(403).json({ error: "Not authorized" });

    const students = await prisma.user.findMany({
      where: {
        schoolId,
        role: "STUDENT",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { firstName: "asc" },
    });

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
};

// =============================
// Get student details (with logs)
// =============================
export const getStudentDetails = async (req: AuthRequest, res: Response) => {
  const parsed = studentIdSchema.safeParse(req.params);

  if (!parsed.success)
    return res.status(400).json({ message: "Invalid student ID" });

  const studentId = parsed.data.id;

  try {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        schoolId: req.user!.schoolId, // enforce tenant isolation
        role: "STUDENT",
      },
      include: {
        moodLogs: true,
        biometricLogs: true,
      },
    });

    if (!student)
      return res.status(404).json({ message: "Student not found" });

    res.json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch student details" });
  }
};
