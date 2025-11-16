import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { Consent } from "../types/models";
import { z } from "zod";

// Zod schemas
const createConsentSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  consentGiven: z.boolean(),
  anonymizeData: z.boolean(),
  parentalConsentGiven: z.boolean(),
});

const updateConsentSchema = createConsentSchema.partial();

// Get all consents
export const getAllConsents = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const consents: Consent[] = await prisma.consent.findMany({
      include: { user: true },
    });
    res.status(200).json(consents);
  } catch (error) {
    console.error("Error fetching consents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get consent by ID
export const getConsentById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const consent: Consent | null = await prisma.consent.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!consent)
      return res.status(404).json({ message: "Consent record not found" });
    res.status(200).json(consent);
  } catch (error) {
    console.error("Error fetching consent by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create consent
export const createConsent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parsed = createConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const newConsent: Consent = await prisma.consent.create({
      data: parsed.data,
    });
    res.status(201).json(newConsent);
  } catch (error) {
    console.error("Error creating consent record:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update consent
export const updateConsent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const parsed = updateConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation error",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updatedConsent: Consent = await prisma.consent.update({
      where: { id },
      data: parsed.data,
    });
    res.status(200).json(updatedConsent);
  } catch (error) {
    console.error("Error updating consent record:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete consent
export const deleteConsent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.consent.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting consent record:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
