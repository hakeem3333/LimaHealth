import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { BiometricLog } from "../types/models";
import { z } from "zod";

// 🧱 Zod schema for validation
const biometricLogSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  heartRate: z.number().min(0, "Heart rate must be non-negative"),
  skinTemp: z.number().min(0, "Skin temperature must be non-negative"),
  gsr: z.number().min(0, "GSR must be non-negative"),
  movement: z.number().min(0, "Movement must be non-negative"),
  stressLevelScore: z.number().min(0).max(100, "Stress level must be 0–100"),
});

const updateBiometricLogSchema = biometricLogSchema.partial();

/**
 * Get all biometric logs
 */
export const getAllBiometricLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const biometricLogs: BiometricLog[] = await prisma.biometricLog.findMany({
      include: { user: true },
    });
    res.status(200).json(biometricLogs);
  } catch (error) {
    console.error("Error fetching biometric logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get a biometric log by ID
 */
export const getBiometricLogById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const biometricLog = await prisma.biometricLog.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!biometricLog) {
      res.status(404).json({ message: "Biometric log not found" });
      return;
    }

    res.status(200).json(biometricLog);
  } catch (error) {
    console.error("Error fetching biometric log by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Create a new biometric log
 */
export const createBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = biometricLogSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });

    const newBiometricLog = await prisma.biometricLog.create({
      data: parsed.data,
    });
    res.status(201).json(newBiometricLog);
  } catch (error) {
    console.error("Error creating biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Update an existing biometric log
 */
export const updateBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = updateBiometricLogSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });

    const updatedBiometricLog = await prisma.biometricLog.update({
      where: { id },
      data: parsed.data,
    });
    res.status(200).json(updatedBiometricLog);
  } catch (error) {
    console.error("Error updating biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Delete a biometric log
 */
export const deleteBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.biometricLog.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
