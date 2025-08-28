import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { MoodLog } from "../types/models";

/**
 * Retrieves all mood logs from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllMoodLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const moodLogs: MoodLog[] = await prisma.moodLog.findMany({
      include: {
        user: true,
      },
    });
    res.status(200).json(moodLogs);
  } catch (error) {
    console.error("Error fetching mood logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single mood log by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getMoodLogById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const moodLog: MoodLog | null = await prisma.moodLog.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
    if (!moodLog) {
      res.status(404).json({ message: "Mood log not found" });
      return;
    }
    res.status(200).json(moodLog);
  } catch (error) {
    console.error("Error fetching mood log by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new mood log.
 * @param req The Express request object with the new mood log data.
 * @param res The Express response object.
 */
export const createMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId, moodEmoji, notes } = req.body;
  try {
    const newMoodLog: MoodLog = await prisma.moodLog.create({
      data: {
        userId,
        moodEmoji,
        notes,
      },
    });
    res.status(201).json(newMoodLog);
  } catch (error) {
    console.error("Error creating mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing mood log by its ID.
 * @param req The Express request object with the updated mood log data.
 * @param res The Express response object.
 */
export const updateMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { userId, moodEmoji, notes } = req.body;
  try {
    const updatedMoodLog: MoodLog = await prisma.moodLog.update({
      where: { id },
      data: {
        userId,
        moodEmoji,
        notes,
      },
    });
    res.status(200).json(updatedMoodLog);
  } catch (error) {
    console.error("Error updating mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a mood log by its ID.
 * @param req The Express request object with the mood log ID.
 * @param res The Express response object.
 */
export const deleteMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.moodLog.delete({
      where: { id },
    });
    res.status(204).send(); // 204 No Content for a successful delete
  } catch (error) {
    console.error("Error deleting mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
