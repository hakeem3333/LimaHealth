import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { School } from "../types/models";

/**
 * Retrieves all schools from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllSchools = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const schools: School[] = await prisma.school.findMany({
      include: {
        users: true,
        subscriptions: true,
      },
    });
    res.status(200).json(schools);
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single school by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getSchoolById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const school: School | null = await prisma.school.findUnique({
      where: { id },
      include: {
        users: true,
        subscriptions: true,
      },
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
 * Creates a new school.
 * @param req The Express request object with the new school data.
 * @param res The Express response object.
 */
// export const createSchool = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   const { name, contact_email } = req.body;

//   if (!name || !contact_email) {
//     res.status(400).json({ error: "name and contact_email are required" });
//     return;
//   }

//   try {
//     // ✅ Check if school exists
//     const existingSchool = await prisma.school.findFirst({
//       where: {
//         OR: [{ name }, { contact_email }],
//       },
//     });

//     if (existingSchool) {
//       res.status(409).json({ error: "School already exists" });
//       return;
//     }

//     // ✅ Create new school
//     const newSchool: School = await prisma.school.create({
//       data: {
//         name,
//         contact_email,
//       },
//     });

//     res.status(201).json(newSchool);
//   } catch (error) {
//     console.error("Error creating school:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

/**
 * Updates an existing school by its ID.
 * @param req The Express request object with the updated school data.
 * @param res The Express response object.
 */
export const updateSchool = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { name, contact_email } = req.body;
  try {
    const updatedSchool: School = await prisma.school.update({
      where: { id },
      data: {
        name,
        contact_email,
      },
    });
    res.status(200).json(updatedSchool);
  } catch (error) {
    console.error("Error updating school:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a school by its ID.
 * @param req The Express request object with the school ID.
 * @param res The Express response object.
 */
export const deleteSchool = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.school.delete({
      where: { id },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting school:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
