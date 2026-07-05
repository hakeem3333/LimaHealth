import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../services/prisma.service";
// Zod schema for organisation creation/updating
const orgSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact_email: z.string().email("Invalid email"),
});

/**
 * Retrieves all schools
 */
export const getAllOrgs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const orgs = await prisma.organisation.findMany({
      include: { users: true, subscriptions: true },
    });
    res.status(200).json(orgs);
  } catch (error) {
    console.error("Error fetching organisations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single school by ID
 */
export const getOrgById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const org = await prisma.organisation.findUnique({
      where: { id },
      include: { users: true, subscriptions: true },
    });
    if (!org) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    res.status(200).json(org);
  } catch (error) {
    console.error("Error fetching organisation by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new school
 */
export const createOrganisation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = orgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.format() });
      return;
    }

    const { name, contact_email } = parsed.data;

    const existingOrg = await prisma.organisation.findFirst({
      where: { OR: [{ name }, { contact_email }] },
    });

    if (existingOrg) {
      res.status(409).json({ error: "Organisation already exists" });
      return;
    }

    const newOrg = await prisma.organisation.create({
      data: { name, contact_email },
    });
    res.status(201).json(newOrg);
  } catch (error) {
    console.error("Error creating organisation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing school
 */
export const updateOrganisation = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = orgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ errors: parsed.error.format() });
      return;
    }

    const { name, contact_email } = parsed.data;
    const updatedOrg = await prisma.organisation.update({
      where: { id },
      data: { name, contact_email },
    });

    res.status(200).json(updatedOrg);
  } catch (error) {
    console.error("Error updating organisation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a school
 */
export const deleteOrg = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.organisation.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting organisation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
