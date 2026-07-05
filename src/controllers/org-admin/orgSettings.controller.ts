// controllers/orgSettings.controller.ts
import type { Response } from "express";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../types/models.js";

const updateOrgSettingsSchema = z.object({
  name: z.string().min(1).optional(),

  address: z.string().optional(),
  contactEmail: z.string().email().optional(),

  heartRateThreshold: z.number().int().positive().optional(),
  sleepHoursThreshold: z.number().int().positive().optional(),

  emailAlerts: z.boolean().optional(),
  pushAlerts: z.boolean().optional(),

  dataRetentionMonths: z.number().int().positive().optional(),
});


export async function updateOrgSettings(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const parsed = updateOrgSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.flatten(),
    });
  }

  const orgId = req.user.orgId;

  // Fetch existing activationData
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      activationData: true,
    },
  });

  if (!org) {
    return res.status(404).json({ message: "Organisation not found" });
  }

  const existingSettings = (org.activationData as any)?.settings ?? {};

  // Merge settings safely
  const updatedSettings = {
    ...existingSettings,
    ...parsed.data,
  };

  await prisma.organisation.update({
    where: { id: orgId },
    data: {
      // name is a real column → update directly
      name: parsed.data.name,

      // everything else goes into activationData
      activationData: {
        ...(org.activationData as object),
        settings: updatedSettings,
      },
    },
  });

  return res.json({
    success: true,
    settings: updatedSettings,
  });
}


export async function getOrgSettings(req: AuthRequest, res: Response) {
  if (!req.user?.orgId) {
    return res.status(403).json({ message: "Organisation context required" });
  }

  const org = await prisma.organisation.findUnique({
    where: { id: req.user.orgId },
    select: {
      name: true,
      activationData: true,
    },
  });

  if (!org) {
    return res.status(404).json({ message: "Organisation not found" });
  }

  return res.json({
    name: org.name,
    settings: (org.activationData as any)?.settings ?? {},
  });
}
