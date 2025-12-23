// controllers/schoolSettings.controller.ts
import { Response } from "express";
import { z } from "zod";
import prisma from "../services/prisma.service";
import type { AuthRequest } from "../../types/models.js";

const updateSchoolSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  heartRateThreshold: z.number().int().positive().optional(),
  sleepHoursThreshold: z.number().int().positive().optional(),
  emailAlerts: z.boolean().optional(),
  pushAlerts: z.boolean().optional(),
  dataRetentionMonths: z.number().int().positive().optional(),
});

type ActivationData = {
  settings?: Record<string, any>;
  [key: string]: any;
};

export async function updateSchoolSettings(req: AuthRequest, res: Response) {
  if (!req.user?.schoolId) {
    return res.status(403).json({ message: "School context required" });
  }

  const parsed = updateSchoolSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.flatten(),
    });
  }

  const schoolId = req.user.schoolId;

  try {
    // Fetch existing activationData
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { activationData: true, name: true },
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const existingSettings =
      (school.activationData as ActivationData)?.settings ?? {};

    // Merge new settings with existing
    const updatedSettings = { ...existingSettings, ...parsed.data };

    // Build update data
    const updateData: any = {
      activationData: {
        ...(school.activationData as object),
        settings: updatedSettings,
      },
    };

    // Update name only if provided
    if (parsed.data.name) {
      updateData.name = parsed.data.name;
    }

    // Save to database
    await prisma.school.update({
      where: { id: schoolId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      name: parsed.data.name ?? school.name,
      settings: updatedSettings,
    });
  } catch (error) {
    console.error("updateSchoolSettings error:", error);
    return res
      .status(500)
      .json({ message: "Failed to update school settings" });
  }
}
