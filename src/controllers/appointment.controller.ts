import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { z } from "zod";

const VALID_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

const bookSchema = z.object({
  counselorId: z.string().uuid("Invalid counselor ID"),
  startTime:   z.string().datetime("Invalid startTime"),
  endTime:     z.string().datetime("Invalid endTime"),
  reason:      z.string().max(500).optional(),
});

const statusSchema = z.object({
  status: z.enum(VALID_STATUSES),
  notes:  z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Book an appointment (Student)
// ---------------------------------------------------------------------------
export const bookAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;

    const parsed = bookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { counselorId, startTime, endTime, reason } = parsed.data;

    const start = new Date(startTime);
    const end   = new Date(endTime);

    if (end <= start) {
      res.status(400).json({ success: false, error: "endTime must be after startTime" });
      return;
    }

    // Verify counselor exists and belongs to same org
    const counselor = await prisma.user.findFirst({
      where: { id: counselorId, orgId: req.user!.orgId, role: { name: "COUNSELOR" } },
      select: { id: true, isAvailable: true, firstName: true, lastName: true },
    });
    if (!counselor) {
      res.status(404).json({ success: false, error: "Counselor not found" });
      return;
    }
    if (!counselor.isAvailable) {
      res.status(409).json({ success: false, error: "Counselor is not currently accepting bookings" });
      return;
    }

    // Slot conflict check — counselor must be free during this window
    const conflict = await prisma.appointment.findFirst({
      where: {
        counselorId,
        status: { in: ["PENDING", "CONFIRMED"] },
        OR: [
          { startTime: { lt: end   }, endTime: { gt: start } },
        ],
      },
    });
    if (conflict) {
      res.status(409).json({ success: false, error: "This time slot is already booked" });
      return;
    }

    const appointment = await prisma.appointment.create({
      data: { studentId, counselorId, startTime: start, endTime: end, reason },
      include: {
        counselor: { select: { firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    console.error("Book Appointment Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Get appointments for the authenticated user
// ---------------------------------------------------------------------------
export const getAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;

    const where = role === "COUNSELOR"
      ? { counselorId: userId }
      : { studentId: userId };

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        student:  { select: { id: true, firstName: true, lastName: true, email: true } },
        counselor:{ select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { startTime: "asc" },
    });

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("Get Appointments Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Get today's appointments (Counselor)
// ---------------------------------------------------------------------------
export const getTodaysAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        counselorId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { not: "CANCELLED" },
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: "asc" },
    });

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("Get Today's Appointments Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Update appointment status (Counselor)
// ---------------------------------------------------------------------------
export const updateAppointmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const { id } = req.params;

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }

    // Ownership check
    const existing = await prisma.appointment.findFirst({ where: { id, counselorId } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Appointment not found" });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: parsed.data.status, notes: parsed.data.notes },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Appointment Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Update counselor availability toggle
// ---------------------------------------------------------------------------
export const updateAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      res.status(400).json({ success: false, error: "isAvailable must be a boolean" });
      return;
    }

    await prisma.user.update({ where: { id: counselorId }, data: { isAvailable } });
    res.status(200).json({ success: true, isAvailable });
  } catch (error) {
    console.error("Update Availability Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
