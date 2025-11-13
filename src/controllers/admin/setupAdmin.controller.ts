import type { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";

/**
 * Add a counsellor under the admin's school
 */
export const addCounsellor = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const schoolId = req.user?.schoolId;

    if (!schoolId)
      return res.status(403).json({ message: "No school context" });
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser)
      return res.status(409).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const counsellor = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        role: "COUNSELOR",
        schoolId,
      },
    });

    res.status(201).json({ message: "Counsellor created", counsellor });
  } catch (err) {
    console.error("Error adding counsellor:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Add a teacher under the admin's school
 */
export const addTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const schoolId = req.user?.schoolId;

    if (!schoolId)
      return res.status(403).json({ message: "No school context" });
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser)
      return res.status(409).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const teacher = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        role: "TEACHER",
        schoolId,
      },
    });

    res.status(201).json({ message: "Teacher created", teacher });
  } catch (err) {
    console.error("Error adding teacher:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Add student(s) manually or via CSV later
 */
export const addStudent = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const schoolId = req.user?.schoolId;

    if (!schoolId)
      return res.status(403).json({ message: "No school context" });
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser)
      return res.status(409).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const student = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        role: "STUDENT",
        schoolId,
      },
    });

    res.status(201).json({ message: "Student created", student });
  } catch (err) {
    console.error("Error adding student:", err);
    res.status(500).json({ message: "Server error" });
  }
};
