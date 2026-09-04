import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../services/prisma.service";
import type { User } from "../types/models";
import bcrypt from "bcryptjs";
import { z } from "zod";

const pushTokenSchema = z.object({
  pushToken: z.string().min(1, "pushToken is required"),
});

const saltRounds = 10;

// Zod schemas for input validation
const createUserSchema = z.object({
  orgId: z.string().uuid(),
  roleId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const updateUserSchema = z.object({
  orgId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

/**
 * Retrieves users within the caller's organisation, optionally filtered by role.
 */
export const getAllUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.user!.orgId;
    if (!orgId) {
      res.status(403).json({ error: "No organisation context" });
      return;
    }

    const role = typeof req.query.role === "string" ? req.query.role : undefined;

    const users = await prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        ...(role ? { role: { name: role } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    });

    res.status(200).json({ success: true, data: users });
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
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        org: true,
        role: true,
        biometricLogs: true,
        moodLogs: true,
        alertsAsStudent: true,
        alertsAsCounselor: true,
        parentOf: true,
        studentOf: true,
        consent: true,
        // passwordHash intentionally excluded — never return credential
        // material, even to a Super Admin caller.
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
 * Registers (or clears, when omitted) the caller's own Expo push token.
 * Self-service only — always acts on the authenticated user, never a
 * caller-supplied ID.
 */
export const registerPushToken = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  try {
    const parsed = pushTokenSchema.parse(req.body);
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: parsed.pushToken },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error registering push token:", error);
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
