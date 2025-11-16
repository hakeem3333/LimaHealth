import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../services/prisma.service";
import type { School } from "../types/models";

// Zod schema for school creation/updating
const schoolSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact_email: z.string().email("Invalid email"),
});

/**
 * Retrieves all schools
 */
export const getAllSchools = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const schools: School[] = await prisma.school.findMany({
      include: { users: true, subscriptions: true },
    });
    res.status(200).json(schools);
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single school by ID
 */
export const getSchoolById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const school: School | null = await prisma.school.findUnique({
      where: { id },
      include: { users: true, subscriptions: true },
    });
    if (!school) {
      res.status(404).json({ message: "School not found" });
      return;
    }
    res.status(200).json(school);
  } catch (error) {
    console.error("Error fetching school by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new school
 */
export const createSchool = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = schoolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.format() });
      return;
    }

    const { name, contact_email } = parsed.data;

    const existingSchool = await prisma.school.findFirst({
      where: { OR: [{ name }, { contact_email }] },
    });

    if (existingSchool) {
      res.status(409).json({ error: "School already exists" });
      return;
    }

    const newSchool: School = await prisma.school.create({
      data: { name, contact_email },
    });
    res.status(201).json(newSchool);
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing school
 */
export const updateSchool = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = schoolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.format() });
      return;
    }

    const { name, contact_email } = parsed.data;
    const updatedSchool: School = await prisma.school.update({
      where: { id },
      data: { name, contact_email },
    });

    res.status(200).json(updatedSchool);
  } catch (error) {
    console.error("Error updating school:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a school
 */
export const deleteSchool = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.school.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting school:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
