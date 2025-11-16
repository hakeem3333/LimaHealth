import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { ParentStudentRelationship } from "../types/models";
import { z } from "zod";

/** -------------------------------
 *  ZOD SCHEMAS
 * --------------------------------
 */

// For create/update body
const relationshipBodySchema = z.object({
  parentId: z.string().uuid("parentId must be a valid UUID"),
  studentId: z.string().uuid("studentId must be a valid UUID"),
});

// For URL params (composite key)
const relationshipParamsSchema = z.object({
  parentId: z.string().uuid("parentId must be a valid UUID"),
  studentId: z.string().uuid("studentId must be a valid UUID"),
});

/**
 * Helper: Safe Zod parsing wrapper
 */
const validate =
  (schema: z.AnyZodObject, source: "body" | "params" = "body") =>
  (req: Request, res: Response, next: Function) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }
    (req as any)[source] = parsed.data;
    next();
  };

/** -------------------------------
 *  CONTROLLERS
 * --------------------------------
 */

export const getAllParentStudentRelationships = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const relationships: ParentStudentRelationship[] =
      await prisma.parentStudentRelationship.findMany({
        include: { parent: true, student: true },
      });

    res.status(200).json(relationships);
  } catch (error) {
    console.error("Error fetching parent-student relationships:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getParentStudentRelationshipById = [
  validate(relationshipParamsSchema, "params"),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;

    try {
      const relationship = await prisma.parentStudentRelationship.findUnique({
        where: { parentId_studentId: { parentId, studentId } },
        include: { parent: true, student: true },
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
  },
];

export const createParentStudentRelationship = [
  validate(relationshipBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.body;

    try {
      const newRelationship = await prisma.parentStudentRelationship.create({
        data: { parentId, studentId },
      });

      res.status(201).json(newRelationship);
    } catch (error) {
      console.error("Error creating relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

export const updateParentStudentRelationship = [
  validate(relationshipParamsSchema, "params"),
  validate(relationshipBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;
    const body = req.body;

    try {
      const updatedRelationship = await prisma.parentStudentRelationship.update(
        {
          where: { parentId_studentId: { parentId, studentId } },
          data: body,
        }
      );

      res.status(200).json(updatedRelationship);
    } catch (error) {
      console.error("Error updating relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

export const deleteParentStudentRelationship = [
  validate(relationshipParamsSchema, "params"),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;

    try {
      await prisma.parentStudentRelationship.delete({
        where: { parentId_studentId: { parentId, studentId } },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];
