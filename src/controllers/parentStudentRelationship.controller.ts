import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js"; // Added .js
import type { ParentStudentRelationship } from "../types/models.js"; // Added .js
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { issueParentConsentRequest } from "./parentConsent.controller.js";
import { adultCutoffDate, calculateAge, isMinor } from "../utils/age.util.js";
import { z } from "zod";

/** -------------------------------
 *  ZOD SCHEMAS
 * --------------------------------
 */

// For create/update body
const relationshipBodySchema = z.object({
  parentId: z.string().uuid("parentId must be a valid UUID"),
  studentId: z.string().uuid("studentId must be a valid UUID"),
});

// For URL params (composite key)
const relationshipParamsSchema = z.object({
  parentId: z.string().uuid("parentId must be a valid UUID"),
  studentId: z.string().uuid("studentId must be a valid UUID"),
});

/**
 * Helper: Safe Zod parsing wrapper
 */
const validate =
  (schema: z.AnyZodObject, source: "body" | "params" = "body") =>
    (req: Request, res: Response, next: Function) => {
      const parsed = schema.safeParse(req[source]);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten(),
        });
      }
      (req as any)[source] = parsed.data;
      next();
    };

/** -------------------------------
 *  CONTROLLERS
 * --------------------------------
 */

export const getAllParentStudentRelationships = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const relationships: ParentStudentRelationship[] =
      await prisma.parentStudentRelationship.findMany({
        include: { parent: true, student: true },
      });

    res.status(200).json(relationships);
  } catch (error) {
    console.error("Error fetching parent-student relationships:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getParentStudentRelationshipById = [
  validate(relationshipParamsSchema, "params"),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;

    try {
      const relationship = await prisma.parentStudentRelationship.findUnique({
        where: { parentId_studentId: { parentId, studentId } },
        include: { parent: true, student: true },
      });

      if (!relationship) {
        res.status(404).json({ message: "Relationship not found" });
        return;
      }

      res.status(200).json(relationship);
    } catch (error) {
      console.error("Error fetching relationship by ID:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

export const createParentStudentRelationship = [
  validate(relationshipBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.body;

    try {
      const newRelationship = await prisma.parentStudentRelationship.create({
        data: { parentId, studentId },
      });

      res.status(201).json(newRelationship);
    } catch (error) {
      console.error("Error creating relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

export const updateParentStudentRelationship = [
  validate(relationshipParamsSchema, "params"),
  validate(relationshipBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;
    const body = req.body;

    try {
      const updatedRelationship = await prisma.parentStudentRelationship.update(
        {
          where: { parentId_studentId: { parentId, studentId } },
          data: body,
        }
      );

      res.status(200).json(updatedRelationship);
    } catch (error) {
      console.error("Error updating relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

export const deleteParentStudentRelationship = [
  validate(relationshipParamsSchema, "params"),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;

    try {
      await prisma.parentStudentRelationship.delete({
        where: { parentId_studentId: { parentId, studentId } },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting relationship:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

/**
 * Get Child Health Data
 * Checks for parental consent before returning data.
 */
export const getChildHealthData = [
  validate(relationshipParamsSchema, "params"),
  async (req: Request, res: Response): Promise<void> => {
    const { parentId, studentId } = req.params;

    try {
      // 1. Verify Relationship
      const relationship = await prisma.parentStudentRelationship.findUnique({
        where: { parentId_studentId: { parentId, studentId } },
      });

      if (!relationship) {
        res.status(404).json({ message: "Parent-Student relationship not found" });
        return;
      }

      // 2. Check Consent
      const consent = await prisma.consent.findUnique({
        where: { userId: studentId },
      });

      if (!consent || !consent.parentalConsentGiven) {
        res.status(403).json({ message: "Parental consent not granted for this student." });
        return;
      }

      // 3. Fetch Data
      const moodLogs = await prisma.moodLog.findMany({
        where: { userId: studentId },
        orderBy: { timestamp: "desc" },
        take: 10,
      });

      const biometricLogs = await prisma.biometricLog.findMany({
        where: { userId: studentId },
        orderBy: { timestamp: "desc" },
        take: 10,
      });

      res.status(200).json({
        studentId,
        moodLogs,
        biometricLogs,
      });
    } catch (error) {
      console.error("Error fetching child health data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

/**
 * GET /parent-relationships/student/:studentId
 * Org-admin view of a single student's parent link + consent state — powers
 * the "Parental Consent" card on the student profile page. Org-scoped so one
 * school can't probe another's students.
 */
export const getStudentParentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user?.orgId;
  const { studentId } = req.params;

  if (!orgId) {
    res.status(403).json({ message: "Organisation access required" });
    return;
  }
  if (!studentId) {
    res.status(400).json({ message: "studentId is required" });
    return;
  }

  try {
    const student = await prisma.user.findFirst({
      where: { id: studentId, orgId, role: { name: "STUDENT" } },
      select: { id: true },
    });
    if (!student) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const relationship = await prisma.parentStudentRelationship.findFirst({
      where: { studentId },
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const consent = await prisma.consent.findUnique({
      where: { userId: studentId },
      select: { parentalConsentGiven: true },
    });

    const pendingRequest = relationship
      ? await prisma.parentConsentToken.findFirst({
          where: {
            studentId,
            parentId: relationship.parentId,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: { expiresAt: true, createdAt: true },
        })
      : null;

    res.status(200).json({
      parent: relationship?.parent ?? null,
      consentGiven: consent?.parentalConsentGiven ?? null,
      pendingRequest,
    });
  } catch (error) {
    console.error("Error fetching student parent status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /parent-relationships/org-overview
 * Org-admin dashboard list: every student in the org with their linked
 * parent (if any) and consent status in one query, for the "Parent Consent"
 * management page. Org-scoped so one school can't see another's students.
 */
export const getOrgParentConsentOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user?.orgId;
  if (!orgId) {
    res.status(403).json({ message: "Organisation access required" });
    return;
  }

  try {
    // Parental consent only applies to minors — adults and students with no
    // date of birth on file are left out.
    const students = await prisma.user.findMany({
      where: { orgId, role: { name: "STUDENT" }, dateOfBirth: { gt: adultCutoffDate() } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        dateOfBirth: true,
        studentOf: {
          select: {
            parent: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        consent: { select: { parentalConsentGiven: true } },
        parentConsentTokensAsStudent: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { expiresAt: true, createdAt: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const rows = students.map((s) => {
      const parent = s.studentOf[0]?.parent ?? null;
      const consentGiven = s.consent?.parentalConsentGiven ?? null;
      const pendingRequest = s.parentConsentTokensAsStudent[0] ?? null;

      // A live pending request takes priority over a past decision — resending
      // after a decline (or to reconfirm a grant) means a new answer is awaited,
      // so the old consentGiven value shouldn't keep reporting the stale state.
      const status = pendingRequest
        ? "PENDING"
        : consentGiven === true
        ? "GRANTED"
        : consentGiven === false
        ? "DECLINED"
        : parent
        ? "NOT_REQUESTED"
        : "UNLINKED";

      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        studentEmail: s.email,
        age: calculateAge(s.dateOfBirth),
        isMinor: isMinor(s.dateOfBirth),
        parent,
        consentGiven,
        pendingRequest,
        status,
      };
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching org parent-consent overview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const linkParentSchema = z.object({
  studentId: z.string().uuid("studentId must be a valid UUID"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
});

type LinkParentResult =
  | {
      ok: true;
      relationship: { parentId: string; studentId: string };
      parent: { id: string; firstName: string; lastName: string; email: string };
    }
  | { ok: false; status: number; message: string };

/**
 * Links a parent/guardian to an already-loaded student, creating the parent's
 * account first if one doesn't exist for that email, then fires the consent
 * request (parents get no separate welcome email). Shared by the manual
 * "Link parent" action, single enrollment, and bulk upload so every path
 * triggers consent the same way. Throws on unexpected DB errors.
 */
export async function linkParentToStudent({
  orgId,
  student,
  firstName,
  lastName,
  email,
}: {
  orgId: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    org?: { orgType?: string | null | undefined; name?: string | null | undefined } | null;
  };
  firstName: string;
  lastName: string;
  email: string;
}): Promise<LinkParentResult> {
  const parentRole = await prisma.role.findUnique({ where: { name: "PARENT" } });
  if (!parentRole) {
    return { ok: false, status: 500, message: "PARENT role is not configured for this platform" };
  }

  let parent = await prisma.user.findUnique({ where: { email } });

  if (parent) {
    if (parent.roleId !== parentRole.id) {
      return { ok: false, status: 409, message: "This email belongs to an existing account with a different role." };
    }
  } else {
    // Parent accounts are passwordless — they sign in via an emailed one-time code.
    parent = await prisma.user.create({
      data: { firstName, lastName, email, passwordHash: null, orgId, roleId: parentRole.id },
    });
  }

  const relationship = await prisma.parentStudentRelationship.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: {},
    create: { parentId: parent.id, studentId: student.id },
  });

  // Linking a parent is the enrollment-time trigger for consent: fire the
  // request immediately so staff don't need a separate manual "send" step.
  // The consent request is the only email a parent receives on linking.
  issueParentConsentRequest({
    studentId: student.id,
    parentId: parent.id,
    parentEmail: parent.email,
    parentFirstName: parent.firstName,
    studentFirstName: student.firstName,
    studentLastName: student.lastName,
    orgType: student.org?.orgType,
    orgName: student.org?.name,
  }).catch((err) => console.error("Auto consent request failed:", parent!.email, err));

  return {
    ok: true,
    relationship,
    parent: { id: parent.id, firstName: parent.firstName, lastName: parent.lastName, email: parent.email },
  };
}

/**
 * POST /parent-relationships/link
 * Org-admin action: links a parent/guardian to a student, creating the
 * parent's account first if one doesn't already exist for that email.
 * Parent accounts are passwordless (see auth/parentOtpLogin.controller.ts).
 */
export const linkParent = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user?.orgId;
  if (!orgId) {
    res.status(403).json({ message: "Organisation access required" });
    return;
  }

  const parsed = linkParentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { studentId, firstName, lastName, email } = parsed.data;

  try {
    const student = await prisma.user.findFirst({
      where: { id: studentId, orgId, role: { name: "STUDENT" } },
      include: { org: true },
    });
    if (!student) {
      res.status(404).json({ message: "Student not found" });
      return;
    }
    if (isMinor(student.dateOfBirth) !== true) {
      res.status(400).json({ message: "Parents can only be linked to students under 18" });
      return;
    }

    const result = await linkParentToStudent({ orgId, student, firstName, lastName, email });
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.status(201).json({ relationship: result.relationship, parent: result.parent });
  } catch (error) {
    console.error("Error linking parent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
