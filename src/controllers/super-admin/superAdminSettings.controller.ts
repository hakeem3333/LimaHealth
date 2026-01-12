import type { Response } from "express";
import type { AuthRequest } from "../../types/models";
import { z } from "zod";
import prisma from "../../services/prisma.service";

const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const DEFAULT_PLATFORM_SETTINGS = {
  allowSchoolSignup: true,
  defaultSchoolStatus: "PENDING_EMAIL_VERIFICATION",
  requireEmailVerification: true,
  adminOtpExpiryMinutes: 15,
  enforceAuditLogging: true,
  enableWearables: true,
  enableAlerts: true,
  dataRetentionMonths: 36,
  enforceAnonymization: false,
};

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

/**
 * GET /super-admin/platform-settings
 */
export async function getPlatformSettings(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "global" },
      update: {},
      create: { id: "global", ...DEFAULT_PLATFORM_SETTINGS },
    });

    return res.json(settings);
  } catch (error) {
    console.error("Failed to get platform settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PUT /super-admin/platform-settings
 */
export async function updatePlatformSettings(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const previousSettings = await prisma.platformSettings.findUnique({
      where: { id: "global" },
    });

    const updated = await prisma.platformSettings.update({
      where: { id: "global" },
      data: parsed.data,
    });

    // Record audit log with what changed
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: ROLES.SUPER_ADMIN,
        action: "UPDATE_PLATFORM_SETTINGS",
        metadata: {
          before: previousSettings,
          after: updated,
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Failed to update platform settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
