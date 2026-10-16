import prisma from "../services/prisma.service.js";

// Org-configurable wellness thresholds ("AI Wellness Thresholds" in the admin
// settings page), stored in Organisation.activationData.settings.

export const DEFAULT_HEART_RATE_THRESHOLD = 100; // bpm — HIGH heart-rate alert
export const DEFAULT_SLEEP_TARGET = 8;           // hours/night
export const HEART_RATE_CRITICAL_MARGIN = 20;    // bpm above the threshold → CRITICAL

export interface OrgThresholds {
  heartRateHigh: number;
  heartRateCritical: number;
  sleepTarget: number;
}

export function thresholdsFromSettings(settings: any): OrgThresholds {
  const hr = Number(settings?.heartRateThreshold);
  const sleep = Number(settings?.sleepHoursThreshold);
  const heartRateHigh = hr > 0 ? hr : DEFAULT_HEART_RATE_THRESHOLD;
  return {
    heartRateHigh,
    heartRateCritical: heartRateHigh + HEART_RATE_CRITICAL_MARGIN,
    sleepTarget: sleep > 0 ? sleep : DEFAULT_SLEEP_TARGET,
  };
}

export async function getOrgThresholds(orgId: string | null | undefined): Promise<OrgThresholds> {
  if (!orgId) return thresholdsFromSettings(null);
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { activationData: true },
  });
  return thresholdsFromSettings((org?.activationData as any)?.settings);
}
