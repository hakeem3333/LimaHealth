import type { Response } from "express";
import { z } from "zod";
import prisma from "../services/prisma.service.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { sendPushNotification } from "../services/pushNotification.service.js";

const nameOf = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

// ---------------------------------------------------------------------------
// POST /counselor-requests
// Student-initiated: asks their org to review/change their assigned counselor.
// ---------------------------------------------------------------------------
const createSchema = z.object({
  reason: z.string().min(1, "Please tell us why you'd like a change").max(1000),
});

export const createCounselorChangeRequest = async (req: AuthRequest, res: Response) => {
  const studentId = req.user?.id;
  const orgId = req.user?.orgId;
  if (!studentId || !orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten().fieldErrors });
  }

  try {
    const existingOpen = await prisma.counselorChangeRequest.findFirst({
      where: { studentId, status: "PENDING" },
    });
    if (existingOpen) {
      return res.status(409).json({ message: "You already have a pending counselor change request." });
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, assignedCounselorId: true },
    });

    const request = await prisma.counselorChangeRequest.create({
      data: {
        studentId,
        currentCounselorId: student?.assignedCounselorId ?? null,
        reason: parsed.data.reason,
      },
    });

    // Best-effort: nudge every admin in this org. Never block the response on it.
    prisma.user
      .findMany({ where: { orgId, role: { name: "ORG_ADMIN" } }, select: { id: true } })
      .then((admins) => {
        for (const admin of admins) {
          void sendPushNotification(
            admin.id,
            "Counselor change requested",
            `${nameOf(student ?? { firstName: "A student", lastName: "" })} asked to change their counselor.`,
            { type: "COUNSELOR_CHANGE_REQUEST", requestId: request.id },
          );
        }
      })
      .catch((err) => console.error("Failed to notify org admins of counselor change request:", err));

    return res.status(201).json(request);
  } catch (error) {
    console.error("Error creating counselor change request:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /counselor-requests/me
// Student-facing: view your own request history (most recent first).
// ---------------------------------------------------------------------------
export const getMyCounselorChangeRequests = async (req: AuthRequest, res: Response) => {
  const studentId = req.user?.id;
  if (!studentId) {
    return res.status(403).json({ message: "Authentication required" });
  }

  try {
    const requests = await prisma.counselorChangeRequest.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        currentCounselor: { select: { id: true, firstName: true, lastName: true } },
        newCounselor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return res.json(requests);
  } catch (error) {
    console.error("Error fetching counselor change requests:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /counselor-requests
// Org-admin: review queue, optionally filtered by status (defaults to PENDING)
// and/or a single studentId (e.g. for a "requests" card on their profile).
// ---------------------------------------------------------------------------
export const listCounselorChangeRequests = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const status = (req.query.status as string | undefined)?.toUpperCase();
  const studentId = req.query.studentId as string | undefined;

  try {
    const requests = await prisma.counselorChangeRequest.findMany({
      where: {
        status: status && status !== "ALL" ? status : "PENDING",
        student: { orgId },
        ...(studentId ? { studentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        currentCounselor: { select: { id: true, firstName: true, lastName: true } },
        newCounselor: { select: { id: true, firstName: true, lastName: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return res.json(requests);
  } catch (error) {
    console.error("Error listing counselor change requests:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /counselor-requests/:id/resolve
// Org-admin: approve (reassigning to newCounselorId) or deny the request.
// ---------------------------------------------------------------------------
const resolveSchema = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  newCounselorId: z.string().uuid().optional(),
  adminNote: z.string().max(1000).optional(),
}).refine((v) => v.decision === "DENIED" || !!v.newCounselorId, {
  message: "newCounselorId is required when approving",
  path: ["newCounselorId"],
});

export const resolveCounselorChangeRequest = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const adminId = req.user?.id;
  const { id } = req.params;
  if (!orgId || !adminId) {
    return res.status(403).json({ message: "Organisation access required" });
  }
  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten().fieldErrors });
  }
  const { decision, newCounselorId, adminNote } = parsed.data;

  try {
    const request = await prisma.counselorChangeRequest.findFirst({
      where: { id, student: { orgId } },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== "PENDING") {
      return res.status(409).json({ message: "This request has already been resolved." });
    }

    let confirmedCounselorId: string | null = null;
    if (decision === "APPROVED") {
      if (!newCounselorId) {
        return res.status(400).json({ message: "newCounselorId is required when approving" });
      }
      const counselor = await prisma.user.findFirst({
        where: { id: newCounselorId, orgId, role: { name: "COUNSELOR" } },
        select: { id: true },
      });
      if (!counselor) {
        return res.status(404).json({ message: "Counselor not found in this organisation" });
      }
      confirmedCounselorId = newCounselorId;
    }

    const [updated] = await prisma.$transaction([
      prisma.counselorChangeRequest.update({
        where: { id },
        data: {
          status: decision,
          newCounselorId: confirmedCounselorId,
          adminNote: adminNote ?? null,
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
      }),
      ...(confirmedCounselorId
        ? [
            prisma.user.update({ where: { id: request.studentId }, data: { assignedCounselorId: confirmedCounselorId } }),
            // One counselor at a time: upcoming sessions with the previous
            // counselor no longer apply once the student is reassigned.
            prisma.appointment.updateMany({
              where: {
                studentId: request.studentId,
                counselorId: { not: confirmedCounselorId },
                status: { in: ["PENDING", "CONFIRMED"] },
                startTime: { gt: new Date() },
              },
              data: { status: "CANCELLED" },
            }),
          ]
        : []),
    ]);

    void sendPushNotification(
      request.studentId,
      decision === "APPROVED" ? "Counselor change approved" : "Counselor change request update",
      decision === "APPROVED"
        ? "Your request was approved — your counselor has been updated."
        : "Your request to change counselors was declined." + (adminNote ? ` Note: ${adminNote}` : ""),
      { type: "COUNSELOR_CHANGE_RESOLVED", requestId: id, decision },
    );

    return res.json(updated);
  } catch (error) {
    console.error("Error resolving counselor change request:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
