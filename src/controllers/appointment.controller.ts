import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { z } from "zod";
import crypto from "crypto";

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

const scheduleSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  mode:      z.enum(["defined", "options"]),
  slots: z
    .array(
      z.object({
        startTime: z.string().datetime("Invalid startTime"),
        endTime:   z.string().datetime("Invalid endTime"),
      }),
    )
    .min(1)
    .max(3),
  reason: z.string().max(500).optional(),
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

const hourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm 24-hour format"),
  endTime:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm 24-hour format"),
});

const weeklyHoursSchema = z.object({
  hours: z.array(hourSchema).max(7),
});

// ---------------------------------------------------------------------------
// GET /appointments/availability/hours — this counselor's recurring weekly
// working hours (one row per open day).
// ---------------------------------------------------------------------------
export const getWeeklyHours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const hours = await prisma.counselorAvailability.findMany({
      where: { counselorId },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    });
    res.status(200).json({ success: true, data: hours });
  } catch (error) {
    console.error("Get Weekly Hours Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// PUT /appointments/availability/hours — full replace of the weekly
// schedule; a day omitted from the body becomes unavailable.
// ---------------------------------------------------------------------------
export const setWeeklyHours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const parsed = weeklyHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { hours } = parsed.data;

    const seenDays = new Set<number>();
    for (const h of hours) {
      if (seenDays.has(h.dayOfWeek)) {
        res.status(400).json({ success: false, error: "Only one time window per day is supported" });
        return;
      }
      seenDays.add(h.dayOfWeek);
      if (h.endTime <= h.startTime) {
        res.status(400).json({ success: false, error: "endTime must be after startTime for every day" });
        return;
      }
    }

    await prisma.$transaction([
      prisma.counselorAvailability.deleteMany({ where: { counselorId } }),
      ...(hours.length
        ? [prisma.counselorAvailability.createMany({
            data: hours.map((h) => ({ ...h, counselorId })),
          })]
        : []),
    ]);

    const saved = await prisma.counselorAvailability.findMany({
      where: { counselorId },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    });
    res.status(200).json({ success: true, data: saved });
  } catch (error) {
    console.error("Set Weekly Hours Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Schedule an appointment for a student (Counselor)
//
// mode: "defined"  — exactly one slot, created straight as CONFIRMED, no
//                     choice for the student.
// mode: "options"  — 2-3 candidate slots, created as OPTION rows sharing a
//                     groupId; the student picks one via selectAppointmentOption.
// ---------------------------------------------------------------------------
export const scheduleAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;

    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { studentId, mode, slots, reason } = parsed.data;

    if (mode === "defined" && slots.length !== 1) {
      res.status(400).json({ success: false, error: "A defined appointment takes exactly one time slot" });
      return;
    }
    if (mode === "options" && slots.length < 2) {
      res.status(400).json({ success: false, error: "Provide 2 or 3 time options for the student to choose from" });
      return;
    }

    // The student must actually be on this counselor's caseload.
    const student = await prisma.user.findFirst({
      where: { id: studentId, assignedCounselorId: counselorId, role: { name: "STUDENT" } },
      select: { id: true },
    });
    if (!student) {
      res.status(404).json({ success: false, error: "Student not found in your caseload" });
      return;
    }

    const parsedSlots = slots.map((s) => ({ start: new Date(s.startTime), end: new Date(s.endTime) }));
    for (const { start, end } of parsedSlots) {
      if (end <= start) {
        res.status(400).json({ success: false, error: "endTime must be after startTime for every slot" });
        return;
      }
    }

    // If this counselor has declared weekly hours, every proposed slot must
    // fall within them. A counselor who hasn't set hours yet has no
    // restriction, so existing behaviour is unaffected.
    const weeklyHours = await prisma.counselorAvailability.findMany({ where: { counselorId } });
    if (weeklyHours.length > 0) {
      const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      for (const { start, end } of parsedSlots) {
        const window = weeklyHours.find((h) => h.dayOfWeek === start.getDay());
        const withinWindow = window && toHHMM(start) >= window.startTime && toHHMM(end) <= window.endTime;
        if (!withinWindow) {
          res.status(409).json({
            success: false,
            error: "One of the selected times is outside your declared working hours",
          });
          return;
        }
      }
    }

    // Conflict-check every proposed slot against this counselor's existing
    // booked time before creating anything.
    for (const { start, end } of parsedSlots) {
      const conflict = await prisma.appointment.findFirst({
        where: {
          counselorId,
          status: { in: ["PENDING", "CONFIRMED"] },
          OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
        },
      });
      if (conflict) {
        res.status(409).json({
          success: false,
          error: "One of the selected times conflicts with an existing appointment",
        });
        return;
      }
    }

    if (mode === "defined") {
      const { start, end } = parsedSlots[0];
      const appointment = await prisma.appointment.create({
        data: { studentId, counselorId, startTime: start, endTime: end, reason, status: "CONFIRMED" },
        include: { student: { select: { firstName: true, lastName: true } } },
      });
      res.status(201).json({ success: true, data: [appointment] });
      return;
    }

    const groupId = crypto.randomUUID();
    const created = await prisma.$transaction(
      parsedSlots.map(({ start, end }) =>
        prisma.appointment.create({
          data: { studentId, counselorId, startTime: start, endTime: end, reason, status: "OPTION", groupId },
        }),
      ),
    );
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("Schedule Appointment Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Pick one of the proposed time options (Student) — the chosen slot becomes
// CONFIRMED and every sibling option in the same group is auto-cancelled.
// ---------------------------------------------------------------------------
export const selectAppointmentOption = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const { id } = req.params;

    const chosen = await prisma.appointment.findFirst({
      where: { id, studentId, status: "OPTION" },
    });
    if (!chosen) {
      res.status(404).json({ success: false, error: "Appointment option not found" });
      return;
    }

    const [confirmed] = await prisma.$transaction([
      prisma.appointment.update({ where: { id: chosen.id }, data: { status: "CONFIRMED" } }),
      prisma.appointment.updateMany({
        where: { groupId: chosen.groupId, id: { not: chosen.id } },
        data: { status: "CANCELLED" },
      }),
    ]);

    res.status(200).json({ success: true, data: confirmed });
  } catch (error) {
    console.error("Select Appointment Option Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Withdraw a still-pending multi-option proposal (Counselor) — cancels every
// sibling OPTION row in the group at once, not just a single slot.
// ---------------------------------------------------------------------------
export const cancelProposalGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const { groupId } = req.params;

    const owned = await prisma.appointment.findFirst({
      where: { groupId, counselorId, status: "OPTION" },
      select: { id: true },
    });
    if (!owned) {
      res.status(404).json({ success: false, error: "Proposal not found" });
      return;
    }

    await prisma.appointment.updateMany({
      where: { groupId, counselorId, status: "OPTION" },
      data: { status: "CANCELLED" },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Cancel Proposal Group Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
