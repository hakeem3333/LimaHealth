import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import type { Alert } from "../types/models";
import { z } from "zod";

// 🧱 Validation schemas
const alertSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  counselorId: z.string().uuid("Invalid counselor ID").optional(),
  alertType: z.string().min(1, "Alert type is required"),
  message: z.string().min(1, "Message is required"),
  isResolved: z.boolean().default(false),
  notes: z.string().optional(),
});

const updateAlertSchema = alertSchema.partial();

// 🧭 Get all alerts
export const getAllAlerts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const alerts: Alert[] = await prisma.alert.findMany({
      include: { student: true, counselor: true },
    });
    res.status(200).json(alerts);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🧭 Get alert by ID
export const getAlertById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { student: true, counselor: true },
    });

    if (!alert) return res.status(404).json({ message: "Alert not found" });
    res.status(200).json(alert);
  } catch (error) {
    console.error("Error fetching alert by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🧭 Create new alert
export const createAlert = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = alertSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });

    const newAlert = await prisma.alert.create({ data: parsed.data });
    res.status(201).json(newAlert);
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🧭 Update alert
export const updateAlert = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = updateAlertSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });

    const updatedAlert = await prisma.alert.update({
      where: { id },
      data: parsed.data,
    });
    res.status(200).json(updatedAlert);
  } catch (error) {
    console.error("Error updating alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🧭 Delete alert
export const deleteAlert = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.alert.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
