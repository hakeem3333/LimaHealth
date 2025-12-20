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

  // Fetch existing activationData
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      activationData: true,
    },
  });

  if (!school) {
    return res.status(404).json({ message: "School not found" });
  }

  const existingSettings = (school.activationData as any)?.settings ?? {};

  // Merge settings safely
  const updatedSettings = {
    ...existingSettings,
    ...parsed.data,
  };

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      // name is a real column → update directly
      name: parsed.data.name,

      // everything else goes into activationData
      activationData: {
        ...(school.activationData as object),
        settings: updatedSettings,
      },
    },
  });

  return res.json({
    success: true,
    settings: updatedSettings,
  });
}
