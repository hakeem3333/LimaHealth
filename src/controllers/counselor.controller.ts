import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { z } from "zod";

// Validate user input
const studentIdSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid student ID"),
});

export const getStudentsAtRisk = async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) return res.status(403).json({ error: "No school context" });

    const students = await prisma.user.findMany({
      where: {
        schoolId,
        role: "STUDENT", // adjust to your Prisma role enum
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
};

export const getStudentDetails = async (req: Request, res: Response) => {
  // Validate params
  const parsed = studentIdSchema.safeParse(req.params);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid student ID" });

  const studentId = parseInt(parsed.data.id, 10);

  try {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        moodLogs: true,
        biometricLogs: true,
      },
    });

    if (!student) return res.status(404).json({ message: "Student not found" });

    res.json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch student details" });
  }
};
