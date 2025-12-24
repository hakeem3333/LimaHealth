import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import { z } from "zod";
import prisma from "../../services/prisma.service";

export async function getPlatformSettings(req: AuthRequest, res: Response) {
  const settings = await prisma.platformSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });

  res.json(settings);
}

const updateSettingsSchema = z.object({
  allowSchoolSignup: z.boolean(),
  defaultSchoolStatus: z.enum([
    "PENDING_EMAIL_VERIFICATION",
    "PENDING_ACTIVATION",
    "ACTIVE",
  ]),
  requireEmailVerification: z.boolean(),

  adminOtpExpiryMinutes: z.number().min(5).max(60),
  enforceAuditLogging: z.boolean(),

  enableWearables: z.boolean(),
  enableAlerts: z.boolean(),

  dataRetentionMonths: z.number().min(1).max(120),
  enforceAnonymization: z.boolean(),
});

export async function updatePlatformSettings(req: AuthRequest, res: Response) {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten() });
  }

  const updated = await prisma.platformSettings.update({
    where: { id: "global" },
    data: parsed.data,
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.user.id,
      actorRole: "SUPER_ADMIN",
      action: "UPDATE_PLATFORM_SETTINGS",
    },
  });

  res.json(updated);
}
