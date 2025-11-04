import type { Request, Response } from "express";
import prisma from "../services/prisma.service";

export const getStudentsAtRisk = async (req: Request, res: Response) => {
  try {
    const schoolId = req.user.schoolId;
    const students = await prisma.user.findMany({
      where: {
        schoolId,
        role: { name: "student" },
        // optional: filter by risk level if you store it
      },
      select: {
        id: true,
        name: true,
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
  const { id } = req.params;
  try {
    const student = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        moodLogs: true,
        biometricLogs: true,
      },
    });
    res.json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch student details" });
  }
};
