import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { z } from "zod";
import { evaluateMoodAlert } from "../services/alertEngine.service";

const MoodEnum = z.enum(["AWFUL", "DOWN", "OKAY", "GOOD", "GREAT"]);

const createMoodSchema = z.object({
  mood: MoodEnum,
  notes: z.string().max(500).optional(),
});

const updateMoodSchema = z.object({
  mood: MoodEnum.optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /mood-logs
 * Create a mood log entry. Fires alert engine if mood is negative.
 */
export const createMoodLog = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const parsed = createMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    const { mood, notes } = parsed.data;

    // Spam guard: one log per 5 minutes
    const recentLog = await prisma.moodLog.findFirst({
      where: { userId, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    });
    if (recentLog) {
      return res.status(429).json({ message: "You're logging too frequently. Try again shortly." });
    }

    const moodLog = await prisma.moodLog.create({
      data: { userId, moodEmoji: mood, notes },
    });

    // Fire alert engine in the background — never blocks the response
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true, firstName: true, lastName: true },
    });

    if (student?.orgId) {
      evaluateMoodAlert({
        studentId: userId,
        orgId: student.orgId,
        mood,
        studentName: `${student.firstName} ${student.lastName}`,
      }).catch((err) =>
        console.error("[AlertEngine] Mood evaluation error:", err.message)
      );
    }

    return res.status(201).json({ message: "Mood logged successfully", data: moodLog });
  } catch (error) {
    console.error("CREATE MOOD ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /mood-logs
 * Paginated mood history for the authenticated user.
 */
export const getMyMoodLogs = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const [moods, total] = await Promise.all([
      prisma.moodLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.moodLog.count({ where: { userId } }),
    ]);

    return res.json({ data: moods, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("GET MOODS ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /mood-logs/:id
 */
export const getMoodLogById = async (req: Request, res: Response) => {
  try {
    const mood = await prisma.moodLog.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!mood) return res.status(404).json({ message: "Mood log not found" });
    return res.json(mood);
  } catch (error) {
    console.error("GET SINGLE ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * PUT /mood-logs/:id
 */
export const updateMoodLog = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const parsed = updateMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }

    const existing = await prisma.moodLog.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ message: "Mood log not found" });

    const updated = await prisma.moodLog.update({
      where: { id },
      data: { moodEmoji: parsed.data.mood, notes: parsed.data.notes },
    });

    return res.json(updated);
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /mood-logs/:id
 */
export const deleteMoodLog = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.moodLog.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ message: "Mood log not found" });

    await prisma.moodLog.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
