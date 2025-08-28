import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { User } from "../types/models";
import bcrypt from "bcrypt";

const saltRounds = 10;

/**
 * Retrieves all users from the database.
 * @param req The Express request object.
 * @param res The Express response object.
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
 * Retrieves a single user by their ID.
 * @param req The Express request object.
 * @param res The Express response object.
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
 * @param req The Express request object with the new user data.
 * @param res The Express response object.
 */
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { schoolId, roleId, firstName, lastName, email, password } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const newUser: User = await prisma.user.create({
      data: {
        schoolId,
        roleId,
        firstName,
        lastName,
        email,
        passwordHash,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing user by their ID.
 * @param req The Express request object with the updated user data.
 * @param res The Express response object.
 */
export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { schoolId, roleId, firstName, lastName, email, password } = req.body;
  try {
    const updateData: any = {
      schoolId,
      roleId,
      firstName,
      lastName,
      email,
    };
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, saltRounds);
    }
    const updatedUser: User = await prisma.user.update({
      where: { id },
      data: updateData,
    });
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a user by their ID.
 * @param req The Express request object with the user ID.
 * @param res The Express response object.
 */
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.user.delete({
      where: { id },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
