import { z } from "zod";
import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { Role } from "../types/models";

// ✅ Zod schemas
const roleSchema = z.object({
  name: z.string().min(1, "Role name is required"),
});

/**
 * Retrieves all roles from the database.
 */
export const getAllRoles = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const roles: Role[] = await prisma.role.findMany({
      include: {
        users: true,
      },
    });
    res.status(200).json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single role by its ID.
 */
export const getRoleById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid role ID" });

  try {
    const role: Role | null = await prisma.role.findUnique({
      where: { id },
      include: { users: true },
    });
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.status(200).json(role);
  } catch (error) {
    console.error("Error fetching role by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new role.
 */
export const createRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parseResult = roleSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.issues });
  }

  try {
    const newRole: Role = await prisma.role.create({ data: parseResult.data });
    res.status(201).json(newRole);
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing role by its ID.
 */
export const updateRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid role ID" });

  const parseResult = roleSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.issues });
  }

  try {
    const updatedRole: Role = await prisma.role.update({
      where: { id },
      data: parseResult.data,
    });
    res.status(200).json(updatedRole);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a role by its ID.
 */
export const deleteRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid role ID" });

  try {
    await prisma.role.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
