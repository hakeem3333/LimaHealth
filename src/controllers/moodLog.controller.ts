import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { z } from "zod";
import type { MoodLog } from "../types/models";

// Zod schema for creating/updating mood logs
const moodLogSchema = z.object({
  userId: z.string().uuid("Invalid userId"), // assuming userId is a UUID
  moodEmoji: z.string().min(1, "Mood emoji is required"),
  notes: z.string().optional(),
});

/**
 * Retrieves all mood logs from the database.
 */
export const getAllMoodLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const moodLogs: MoodLog[] = await prisma.moodLog.findMany({
      include: { user: true },
    });
    res.status(200).json(moodLogs);
  } catch (error) {
    console.error("Error fetching mood logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single mood log by its ID.
 */
export const getMoodLogById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const moodLog: MoodLog | null = await prisma.moodLog.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!moodLog)
      return res.status(404).json({ message: "Mood log not found" });
    res.status(200).json(moodLog);
  } catch (error) {
    console.error("Error fetching mood log by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new mood log with Zod validation.
 */
export const createMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parseResult = moodLogSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.issues });
  }
  const { userId, moodEmoji, notes } = parseResult.data;

  try {
    const newMoodLog: MoodLog = await prisma.moodLog.create({
      data: { userId, moodEmoji, notes },
    });
    res.status(201).json(newMoodLog);
  } catch (error) {
    console.error("Error creating mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing mood log by its ID with Zod validation.
 */
export const updateMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parseResult = moodLogSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.issues });
  }
  const { userId, moodEmoji, notes } = parseResult.data;
  const { id } = req.params;

  try {
    const updatedMoodLog: MoodLog = await prisma.moodLog.update({
      where: { id },
      data: { userId, moodEmoji, notes },
    });
    res.status(200).json(updatedMoodLog);
  } catch (error) {
    console.error("Error updating mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a mood log by its ID.
 */
export const deleteMoodLog = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.moodLog.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting mood log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
