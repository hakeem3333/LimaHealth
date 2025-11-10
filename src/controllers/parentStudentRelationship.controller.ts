import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { ParentStudentRelationship } from "../types/models";

/**
 * Retrieves all parent-student relationships from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllParentStudentRelationships = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const relationships: ParentStudentRelationship[] =
      await prisma.parentStudentRelationship.findMany({
        include: {
          parent: true,
          student: true,
        },
      });
    res.status(200).json(relationships);
  } catch (error) {
    console.error("Error fetching parent-student relationships:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single parent-student relationship by its composite ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getParentStudentRelationshipById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { parentId, studentId } = req.params;
  try {
    const relationship: ParentStudentRelationship | null =
      await prisma.parentStudentRelationship.findUnique({
        where: { parentId_studentId: { parentId, studentId } },
        include: {
          parent: true,
          student: true,
        },
      });
    if (!relationship) {
      res.status(404).json({ message: "Relationship not found" });
      return;
    }
    res.status(200).json(relationship);
  } catch (error) {
    console.error("Error fetching relationship by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new parent-student relationship.
 * @param req The Express request object with the new relationship data.
 * @param res The Express response object.
 */
export const createParentStudentRelationship = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { parentId, studentId } = req.body;
  try {
    const newRelationship: ParentStudentRelationship =
      await prisma.parentStudentRelationship.create({
        data: {
          parentId,
          studentId,
        },
      });
    res.status(201).json(newRelationship);
  } catch (error) {
    console.error("Error creating relationship:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing parent-student relationship by its composite ID.
 * @param req The Express request object with the updated relationship data.
 * @param res The Express response object.
 */
export const updateParentStudentRelationship = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { parentId, studentId } = req.params;
  try {
    const updatedRelationship: ParentStudentRelationship =
      await prisma.parentStudentRelationship.update({
        where: { parentId_studentId: { parentId, studentId } },
        data: {
          parentId,
          studentId,
        },
      });
    res.status(200).json(updatedRelationship);
  } catch (error) {
    console.error("Error updating relationship:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a parent-student relationship by its composite ID.
 * @param req The Express request object with the relationship IDs.
 * @param res The Express response object.
 */
export const deleteParentStudentRelationship = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { parentId, studentId } = req.params;
  try {
    await prisma.parentStudentRelationship.delete({
      where: { parentId_studentId: { parentId, studentId } },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting relationship:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
