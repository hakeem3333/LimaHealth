import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../services/prisma.service";
import type { Subscription } from "../types/models";

// Zod schema for subscription create/update
const subscriptionSchema = z.object({
  schoolId: z.string().uuid(),
  stripeSubscriptionId: z.string(),
  planTier: z.string(),
  status: z.string(),
  currentPeriodEnd: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
});

/**
 * Retrieves all subscriptions from the database.
 */
export const getAllSubscriptions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const subscriptions: Subscription[] = await prisma.subscription.findMany({
      include: { school: true },
    });
    res.status(200).json(subscriptions);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single subscription by its ID.
 */
export const getSubscriptionById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const subscription: Subscription | null =
      await prisma.subscription.findUnique({
        where: { id },
        include: { school: true },
      });
    if (!subscription) {
      res.status(404).json({ message: "Subscription not found" });
      return;
    }
    res.status(200).json(subscription);
  } catch (error) {
    console.error("Error fetching subscription by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new subscription.
 */
export const createSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsedData = subscriptionSchema.parse(req.body);

    const newSubscription: Subscription = await prisma.subscription.create({
      data: {
        ...parsedData,
        currentPeriodEnd: new Date(parsedData.currentPeriodEnd),
      },
    });

    res.status(201).json(newSubscription);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing subscription by its ID.
 */
export const updateSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    const parsedData = subscriptionSchema.parse(req.body);

    const updatedSubscription: Subscription = await prisma.subscription.update({
      where: { id },
      data: {
        ...parsedData,
        currentPeriodEnd: new Date(parsedData.currentPeriodEnd),
      },
    });

    res.status(200).json(updatedSubscription);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error updating subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a subscription by its ID.
 */
export const deleteSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.subscription.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
