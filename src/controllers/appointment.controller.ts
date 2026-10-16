import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { z } from "zod";
import crypto from "crypto";
import { addDaysToYmd, isValidTimeZone, zonedParts, zonedWallTimeToUtc } from "../utils/timezone.util.js";

const VALID_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
type Status = (typeof VALID_STATUSES)[number];

// Statuses that hold a counselor's time. OPTION rows count: until the student
// picks, any of the proposed times may become a real session.
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "OPTION"] as const;

// What a counselor may move an appointment to from its current status.
// OPTION rows are handled by select / group-cancel, never by this map.
const ALLOWED_TRANSITIONS: Partial<Record<string, Status[]>> = {
  PENDING:   ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
};

const SESSION_MINUTES     = 50;
const SLOT_STEP_MINUTES   = 60;  // session + 10-minute buffer
const BOOKING_WINDOW_DAYS = 14;
const MIN_LEAD_MINUTES    = 60;  // students can't book a slot starting within the hour
// Offered to students when their counselor hasn't declared weekly hours yet.
const DEFAULT_SLOT_TIMES  = ["09:00", "10:30", "13:00", "14:30", "16:00"];

const MAX_WINDOWS_PER_DAY = 3;
const MAX_TIME_OFF_DAYS   = 366;

const timezoneSchema = z.string().refine(isValidTimeZone, "Invalid time zone");
const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");

const bookSchema = z.object({
  counselorId: z.string().uuid("Invalid counselor ID").optional(),
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

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Slot = { start: Date; end: Date };
type Tx = Prisma.TransactionClient;

// Serialises every booking write for one counselor for the rest of the
// transaction, so two requests can't both pass the conflict check and then
// both insert the same slot.
const lockCounselorSchedule = (tx: Tx, counselorId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${counselorId}))`;

const findConflict = (
  tx: Tx,
  counselorId: string,
  { start, end }: Slot,
  statuses: readonly string[] = BLOCKING_STATUSES,
  excludeGroupId?: string | null,
) =>
  tx.appointment.findFirst({
    where: {
      counselorId,
      status: { in: statuses as any },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeGroupId ? { NOT: { groupId: excludeGroupId } } : {}),
    },
    select: { id: true },
  });

type HourRow = { dayOfWeek: number; startTime: string; endTime: string; timezone: string };
type TimeOffRow = { startDate: string; endDate: string; timezone: string };

// Whether `slot` fits entirely inside one of that day's windows, evaluated in
// the zone the hours were set in. No declared hours means no restriction.
function fitsWorkingHours(slot: Slot, weeklyHours: HourRow[]): boolean {
  const tz = weeklyHours[0]?.timezone;
  if (!tz) return true;
  const start = zonedParts(slot.start, tz);
  const end   = zonedParts(slot.end, tz);
  return start.ymd === end.ymd && weeklyHours.some((w) =>
    w.dayOfWeek === start.dayOfWeek && start.hhmm >= w.startTime && end.hhmm <= w.endTime,
  );
}

// Whether any part of `slot` lands on a time-off date (dates are calendar
// days in the zone each entry was created in).
function hitsTimeOff(slot: Slot, timeOff: TimeOffRow[]): boolean {
  return timeOff.some((t) => {
    const startDay = zonedParts(slot.start, t.timezone).ymd;
    const endDay   = zonedParts(slot.end, t.timezone).ymd;
    return startDay <= t.endDate && endDay >= t.startDate;
  });
}

// Time off that could still matter: anything not already over. One day of
// slack covers entries whose zone is behind UTC.
const loadActiveTimeOff = (counselorId: string) =>
  prisma.counselorTimeOff.findMany({
    where: { counselorId, endDate: { gte: addDaysToYmd(new Date().toISOString().slice(0, 10), -1) } },
  });

// Why `slot` can't be booked with this counselor, or null if it can.
async function unavailabilityReason(counselorId: string, slot: Slot): Promise<"TIME_OFF" | "OUTSIDE_HOURS" | null> {
  const [weeklyHours, timeOff] = await Promise.all([
    prisma.counselorAvailability.findMany({ where: { counselorId } }),
    loadActiveTimeOff(counselorId),
  ]);
  if (hitsTimeOff(slot, timeOff)) return "TIME_OFF";
  if (!fitsWorkingHours(slot, weeklyHours)) return "OUTSIDE_HOURS";
  return null;
}

function sendError(res: Response, label: string, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, error: error.message });
    return;
  }
  console.error(`${label} Error:`, error);
  res.status(500).json({ success: false, error: "Internal Server Error" });
}

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
    const { startTime, endTime, reason } = parsed.data;

    const start = new Date(startTime);
    const end   = new Date(endTime);

    if (end <= start) {
      res.status(400).json({ success: false, error: "endTime must be after startTime" });
      return;
    }
    if (start <= new Date()) {
      res.status(400).json({ success: false, error: "You can only book a time in the future" });
      return;
    }

    // A student has exactly one counselor at a time — the one their org admin
    // assigned. Switching goes through a counselor-change request, not booking.
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { assignedCounselorId: true },
    });
    const assignedCounselorId = student?.assignedCounselorId;
    if (!assignedCounselorId) {
      res.status(409).json({
        success: false,
        error: "You don't have an assigned counselor yet. Send a request from your profile.",
      });
      return;
    }
    if (parsed.data.counselorId && parsed.data.counselorId !== assignedCounselorId) {
      res.status(403).json({
        success: false,
        error: "You can only book with your assigned counselor. Request a change from your profile.",
      });
      return;
    }
    const counselorId = assignedCounselorId;

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

    const why = await unavailabilityReason(counselorId, { start, end });
    if (why) {
      res.status(409).json({
        success: false,
        error: why === "TIME_OFF"
          ? "Your counselor is away on that date"
          : "That time is outside your counselor's working hours",
      });
      return;
    }

    const appointment = await prisma.$transaction(async (tx) => {
      await lockCounselorSchedule(tx, counselorId);
      if (await findConflict(tx, counselorId, { start, end })) {
        throw new HttpError(409, "This time slot is already booked");
      }
      return tx.appointment.create({
        data: { studentId, counselorId, startTime: start, endTime: end, reason },
        include: {
          counselor: { select: { firstName: true, lastName: true } },
        },
      });
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    sendError(res, "Book Appointment", error);
  }
};

// ---------------------------------------------------------------------------
// GET /appointments/slots?tz=Area/City — bookable times with the student's
// assigned counselor over the next two weeks. Uses the counselor's declared
// weekly hours (in the counselor's zone); a counselor without hours gets the
// default weekday times in the student's own zone (`tz`).
// ---------------------------------------------------------------------------
export const getAvailableSlots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tzParsed = timezoneSchema.optional().safeParse(req.query.tz);
    if (!tzParsed.success) {
      res.status(400).json({ success: false, error: "Invalid time zone" });
      return;
    }

    const student = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { assignedCounselorId: true },
    });
    const counselorId = student?.assignedCounselorId;
    if (!counselorId) {
      res.status(200).json({ success: true, data: { accepting: false, slots: [] } });
      return;
    }

    const counselor = await prisma.user.findFirst({
      where: { id: counselorId, orgId: req.user!.orgId, role: { name: "COUNSELOR" } },
      select: { isAvailable: true },
    });
    if (!counselor?.isAvailable) {
      res.status(200).json({ success: true, data: { accepting: false, slots: [] } });
      return;
    }

    const [weeklyHours, timeOff] = await Promise.all([
      prisma.counselorAvailability.findMany({ where: { counselorId } }),
      loadActiveTimeOff(counselorId),
    ]);
    const tz = weeklyHours[0]?.timezone ?? tzParsed.data ?? "UTC";

    const earliest = new Date(Date.now() + MIN_LEAD_MINUTES * 60_000);
    const today = zonedParts(new Date(), tz).ymd;
    const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

    const candidates: Slot[] = [];
    for (let d = 0; d <= BOOKING_WINDOW_DAYS; d++) {
      const ymd = addDaysToYmd(today, d);
      const dayOfWeek = new Date(`${ymd}T00:00:00Z`).getUTCDay();

      let times: string[];
      if (weeklyHours.length > 0) {
        times = [];
        for (const window of weeklyHours.filter((h) => h.dayOfWeek === dayOfWeek)) {
          const last = toMinutes(window.endTime) - SESSION_MINUTES;
          for (let m = toMinutes(window.startTime); m <= last; m += SLOT_STEP_MINUTES) times.push(toHHMM(m));
        }
      } else {
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        times = DEFAULT_SLOT_TIMES;
      }

      for (const hhmm of times) {
        const start = zonedWallTimeToUtc(ymd, hhmm, tz);
        if (start < earliest) continue;
        const slot = { start, end: new Date(start.getTime() + SESSION_MINUTES * 60_000) };
        if (hitsTimeOff(slot, timeOff)) continue;
        candidates.push(slot);
      }
    }

    const first = candidates[0];
    const last  = candidates[candidates.length - 1];
    const busy = first && last
      ? await prisma.appointment.findMany({
          where: {
            counselorId,
            status: { in: [...BLOCKING_STATUSES] },
            startTime: { lt: last.end },
            endTime: { gt: first.start },
          },
          select: { startTime: true, endTime: true },
        })
      : [];

    const slots = candidates
      .filter(({ start, end }) => !busy.some((b) => b.startTime < end && b.endTime > start))
      .map(({ start, end }) => ({ startTime: start.toISOString(), endTime: end.toISOString() }));

    res.status(200).json({ success: true, data: { accepting: true, timezone: tz, slots } });
  } catch (error) {
    sendError(res, "Get Available Slots", error);
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
// Update appointment status (Counselor) — accept / reject a request, cancel a
// confirmed session, or mark a session that has started as COMPLETED.
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
    const { status, notes } = parsed.data;

    // Ownership check
    const existing = await prisma.appointment.findFirst({ where: { id, counselorId } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Appointment not found" });
      return;
    }

    if (!ALLOWED_TRANSITIONS[existing.status]?.includes(status)) {
      res.status(409).json({
        success: false,
        error: `A ${existing.status.toLowerCase()} appointment can't be changed to ${status.toLowerCase()}`,
      });
      return;
    }
    if (status === "COMPLETED" && existing.startTime > new Date()) {
      res.status(409).json({ success: false, error: "A session can't be completed before it starts" });
      return;
    }

    // Guard on the status we checked, so a concurrent change (e.g. the student
    // cancelling) isn't silently overwritten.
    const { count } = await prisma.appointment.updateMany({
      where: { id, counselorId, status: existing.status },
      data: { status, notes },
    });
    if (count === 0) {
      res.status(409).json({ success: false, error: "This appointment was just changed. Refresh and try again." });
      return;
    }

    const updated = await prisma.appointment.findUnique({ where: { id } });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Appointment Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /appointments/:id/cancel (Student) — cancel an upcoming request or
// session. Cancelling a proposed OPTION declines the whole proposal.
// ---------------------------------------------------------------------------
export const cancelMyAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const { id } = req.params;

    const appt = await prisma.appointment.findFirst({ where: { id, studentId } });
    if (!appt) {
      res.status(404).json({ success: false, error: "Appointment not found" });
      return;
    }

    if (appt.status === "OPTION" && appt.groupId) {
      await prisma.appointment.updateMany({
        where: { groupId: appt.groupId, studentId, status: "OPTION" },
        data: { status: "CANCELLED" },
      });
      res.status(200).json({ success: true });
      return;
    }

    if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") {
      res.status(409).json({ success: false, error: "This appointment can no longer be cancelled" });
      return;
    }
    if (appt.startTime <= new Date()) {
      res.status(409).json({ success: false, error: "This session has already started" });
      return;
    }

    const { count } = await prisma.appointment.updateMany({
      where: { id, studentId, status: appt.status },
      data: { status: "CANCELLED" },
    });
    if (count === 0) {
      res.status(409).json({ success: false, error: "This appointment was just changed. Refresh and try again." });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    sendError(res, "Cancel Appointment", error);
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
  hours:    z.array(hourSchema).max(7 * MAX_WINDOWS_PER_DAY),
  timezone: timezoneSchema.optional(),
});

const hoursSelect = { id: true, dayOfWeek: true, startTime: true, endTime: true, timezone: true } as const;

// ---------------------------------------------------------------------------
// GET /appointments/availability/hours — this counselor's recurring weekly
// working hours (one row per window; up to three per day).
// ---------------------------------------------------------------------------
export const getWeeklyHours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const hours = await prisma.counselorAvailability.findMany({
      where: { counselorId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: hoursSelect,
    });
    res.status(200).json({ success: true, data: hours });
  } catch (error) {
    console.error("Get Weekly Hours Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// PUT /appointments/availability/hours — full replace of the weekly
// schedule; a day omitted from the body becomes unavailable. `timezone` is
// the IANA zone the hours are meant in (the counselor's device zone).
// ---------------------------------------------------------------------------
export const setWeeklyHours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const parsed = weeklyHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { hours, timezone = "UTC" } = parsed.data;

    for (const h of hours) {
      if (h.endTime <= h.startTime) {
        res.status(400).json({ success: false, error: "endTime must be after startTime for every window" });
        return;
      }
    }
    for (let day = 0; day <= 6; day++) {
      const windows = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (windows.length > MAX_WINDOWS_PER_DAY) {
        res.status(400).json({ success: false, error: `At most ${MAX_WINDOWS_PER_DAY} time windows per day` });
        return;
      }
      for (let i = 1; i < windows.length; i++) {
        if (windows[i]!.startTime < windows[i - 1]!.endTime) {
          res.status(400).json({ success: false, error: "Time windows on the same day can't overlap" });
          return;
        }
      }
    }

    await prisma.$transaction([
      prisma.counselorAvailability.deleteMany({ where: { counselorId } }),
      ...(hours.length
        ? [prisma.counselorAvailability.createMany({
            data: hours.map((h) => ({ ...h, timezone, counselorId })),
          })]
        : []),
    ]);

    const saved = await prisma.counselorAvailability.findMany({
      where: { counselorId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: hoursSelect,
    });
    res.status(200).json({ success: true, data: saved });
  } catch (error) {
    console.error("Set Weekly Hours Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const timeOffSchema = z.object({
  startDate: ymdSchema,
  endDate:   ymdSchema,
  timezone:  timezoneSchema,
  note:      z.string().trim().max(200).optional(),
});

// Sessions still on the books during a time-off range, so the counselor can
// cancel or move them — they are never cancelled automatically.
const sessionsDuring = (counselorId: string, t: TimeOffRow) =>
  prisma.appointment.findMany({
    where: {
      counselorId,
      status: { in: [...BLOCKING_STATUSES] },
      startTime: { lt: zonedWallTimeToUtc(addDaysToYmd(t.endDate, 1), "00:00", t.timezone) },
      endTime:   { gt: zonedWallTimeToUtc(t.startDate, "00:00", t.timezone) },
    },
    select: {
      id: true, startTime: true, status: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: "asc" },
  });

// ---------------------------------------------------------------------------
// GET /appointments/availability/time-off — this counselor's current and
// upcoming time off, each with the sessions still booked inside it.
// ---------------------------------------------------------------------------
export const getTimeOff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const rows = (await loadActiveTimeOff(counselorId))
      .filter((t) => t.endDate >= zonedParts(new Date(), t.timezone).ymd)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const data = await Promise.all(rows.map(async (t) => ({
      id: t.id, startDate: t.startDate, endDate: t.endDate, timezone: t.timezone, note: t.note,
      affectedSessions: await sessionsDuring(counselorId, t),
    })));
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, "Get Time Off", error);
  }
};

// ---------------------------------------------------------------------------
// POST /appointments/availability/time-off — block whole days (inclusive).
// ---------------------------------------------------------------------------
export const addTimeOff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const parsed = timeOffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { startDate, endDate, timezone, note } = parsed.data;

    const isRealDate = (ymd: string) => {
      const d = new Date(`${ymd}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
    };
    if (!isRealDate(startDate) || !isRealDate(endDate)) {
      res.status(400).json({ success: false, error: "Invalid date" });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ success: false, error: "The end date can't be before the start date" });
      return;
    }
    if (endDate < zonedParts(new Date(), timezone).ymd) {
      res.status(400).json({ success: false, error: "Time off can't be entirely in the past" });
      return;
    }
    if (addDaysToYmd(startDate, MAX_TIME_OFF_DAYS) <= endDate) {
      res.status(400).json({ success: false, error: `Time off can be at most ${MAX_TIME_OFF_DAYS} days` });
      return;
    }

    const row = await prisma.counselorTimeOff.create({
      data: { counselorId, startDate, endDate, timezone, note: note || null },
    });
    const affectedSessions = await sessionsDuring(counselorId, row);

    res.status(201).json({
      success: true,
      data: { id: row.id, startDate, endDate, timezone, note: row.note, affectedSessions },
    });
  } catch (error) {
    sendError(res, "Add Time Off", error);
  }
};

// ---------------------------------------------------------------------------
// DELETE /appointments/availability/time-off/:id
// ---------------------------------------------------------------------------
export const deleteTimeOff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counselorId = req.user!.id;
    const { count } = await prisma.counselorTimeOff.deleteMany({
      where: { id: String(req.params.id), counselorId },
    });
    if (count === 0) {
      res.status(404).json({ success: false, error: "Time off not found" });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    sendError(res, "Delete Time Off", error);
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
    const now = new Date();
    for (const { start, end } of parsedSlots) {
      if (end <= start) {
        res.status(400).json({ success: false, error: "endTime must be after startTime for every slot" });
        return;
      }
      if (start <= now) {
        res.status(400).json({ success: false, error: "Every time must be in the future" });
        return;
      }
    }

    // Every proposed slot must avoid the counselor's time off and, if they
    // have declared weekly hours, fall within them.
    for (const slot of parsedSlots) {
      const why = await unavailabilityReason(counselorId, slot);
      if (why) {
        res.status(409).json({
          success: false,
          error: why === "TIME_OFF"
            ? "One of the selected times falls on your time off"
            : "One of the selected times is outside your declared working hours",
        });
        return;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      await lockCounselorSchedule(tx, counselorId);

      // Conflict-check every proposed slot against this counselor's existing
      // booked time before creating anything.
      for (const slot of parsedSlots) {
        if (await findConflict(tx, counselorId, slot)) {
          throw new HttpError(409, "One of the selected times conflicts with an existing appointment");
        }
      }

      if (mode === "defined") {
        const { start, end } = parsedSlots[0]!;
        return [await tx.appointment.create({
          data: { studentId, counselorId, startTime: start, endTime: end, reason, status: "CONFIRMED" },
          include: { student: { select: { firstName: true, lastName: true } } },
        })];
      }

      const groupId = crypto.randomUUID();
      const rows = [];
      for (const { start, end } of parsedSlots) {
        rows.push(await tx.appointment.create({
          data: { studentId, counselorId, startTime: start, endTime: end, reason, status: "OPTION", groupId },
        }));
      }
      return rows;
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    sendError(res, "Schedule Appointment", error);
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

    const initial = await prisma.appointment.findFirst({
      where: { id, studentId, status: "OPTION" },
      select: { counselorId: true },
    });
    if (!initial) {
      res.status(404).json({ success: false, error: "Appointment option not found" });
      return;
    }

    const confirmed = await prisma.$transaction(async (tx) => {
      await lockCounselorSchedule(tx, initial.counselorId);

      // Re-read under the lock: a concurrent pick of a sibling option (or the
      // counselor withdrawing the proposal) may have landed first.
      const chosen = await tx.appointment.findFirst({ where: { id, studentId, status: "OPTION" } });
      if (!chosen) throw new HttpError(409, "This proposal is no longer open");
      if (chosen.startTime <= new Date()) throw new HttpError(409, "This time has already passed");

      const clash = await findConflict(
        tx, chosen.counselorId,
        { start: chosen.startTime, end: chosen.endTime },
        ["PENDING", "CONFIRMED"],
        chosen.groupId,
      );
      if (clash) throw new HttpError(409, "This time is no longer available. Ask your counselor for new options.");

      const updated = await tx.appointment.update({ where: { id: chosen.id }, data: { status: "CONFIRMED" } });
      await tx.appointment.updateMany({
        where: { groupId: chosen.groupId, id: { not: chosen.id } },
        data: { status: "CANCELLED" },
      });
      return updated;
    });

    res.status(200).json({ success: true, data: confirmed });
  } catch (error) {
    sendError(res, "Select Appointment Option", error);
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
