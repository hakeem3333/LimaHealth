import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { BiometricLog } from "../types/models";

/**
 * Retrieves all biometric logs from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllBiometricLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const biometricLogs: BiometricLog[] = await prisma.biometricLog.findMany({
      include: {
        user: true,
      },
    });
    res.status(200).json(biometricLogs);
  } catch (error) {
    console.error("Error fetching biometric logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single biometric log by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getBiometricLogById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const biometricLog: BiometricLog | null =
      await prisma.biometricLog.findUnique({
        where: { id },
        include: {
          user: true,
        },
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
 * Creates a new biometric log.
 * @param req The Express request object with the new biometric log data.
 * @param res The Express response object.
 */
export const createBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId, heartRate, skinTemp, gsr, movement, stressLevelScore } =
    req.body;
  try {
    const newBiometricLog: BiometricLog = await prisma.biometricLog.create({
      data: {
        userId,
        heartRate,
        skinTemp,
        gsr,
        movement,
        stressLevelScore,
      },
    });
    res.status(201).json(newBiometricLog);
  } catch (error) {
    console.error("Error creating biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing biometric log by its ID.
 * @param req The Express request object with the updated biometric log data.
 * @param res The Express response object.
 */
export const updateBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { userId, heartRate, skinTemp, gsr, movement, stressLevelScore } =
    req.body;
  try {
    const updatedBiometricLog: BiometricLog = await prisma.biometricLog.update({
      where: { id },
      data: {
        userId,
        heartRate,
        skinTemp,
        gsr,
        movement,
        stressLevelScore,
      },
    });
    res.status(200).json(updatedBiometricLog);
  } catch (error) {
    console.error("Error updating biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a biometric log by its ID.
 * @param req The Express request object with the biometric log ID.
 * @param res The Express response object.
 */
export const deleteBiometricLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.biometricLog.delete({
      where: { id },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting biometric log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
