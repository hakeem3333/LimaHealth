import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { Role } from "../types/models";

/**
 * Retrieves all roles from the database.
 * @param req The Express request object.
 * @param res The Express response object.
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
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getRoleById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const role: Role | null = await prisma.role.findUnique({
      where: { id: parseInt(id) },
      include: {
        users: true,
      },
    });
    if (!role) {
      res.status(404).json({ message: "Role not found" });
      return;
    }
    res.status(200).json(role);
  } catch (error) {
    console.error("Error fetching role by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new role.
 * @param req The Express request object with the new role data.
 * @param res The Express response object.
 */
export const createRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { name } = req.body;
  try {
    const newRole: Role = await prisma.role.create({
      data: {
        name,
      },
    });
    res.status(201).json(newRole);
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing role by its ID.
 * @param req The Express request object with the updated role data.
 * @param res The Express response object.
 */
export const updateRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const updatedRole: Role = await prisma.role.update({
      where: { id: parseInt(id) },
      data: {
        name,
      },
    });
    res.status(200).json(updatedRole);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a role by its ID.
 * @param req The Express request object with the role ID.
 * @param res The Express response object.
 */
export const deleteRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.role.delete({
      where: { id: parseInt(id) },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
