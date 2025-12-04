import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { User } from "../types/models";
import bcrypt from "bcrypt";
import { z } from "zod";

const saltRounds = 10;

// Zod schemas for input validation
const createUserSchema = z.object({
  schoolId: z.string().uuid(),
  roleId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const updateUserSchema = z.object({
  schoolId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

/**
 * Retrieves all users from the database.
 */
export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const users: User[] = await prisma.user.findMany({
      include: {
        school: true,
        role: true,
        biometricLogs: true,
        moodLogs: true,
        alertsAsStudent: true,
        alertsAsCounselor: true,
        parentOf: true,
        studentOf: true,
        consent: true,
      },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single user by ID.
 */
export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const user: User | null = await prisma.user.findUnique({
      where: { id },
      include: {
        school: true,
        role: true,
        biometricLogs: true,
        moodLogs: true,
        alertsAsStudent: true,
        alertsAsCounselor: true,
        parentOf: true,
        studentOf: true,
        consent: true,
      },
    });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new user.
 */
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(parsed.password, saltRounds);
    const newUser: User = await prisma.user.create({
      data: {
        ...parsed,
        passwordHash,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing user by ID.
 */
export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = updateUserSchema.parse(req.body);
    const updateData: any = { ...parsed };

    if (parsed.password) {
      updateData.passwordHash = await bcrypt.hash(parsed.password, saltRounds);
      delete updateData.password;
    }

    const updatedUser: User = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a user by ID.
 */
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
