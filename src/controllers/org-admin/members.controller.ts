import type { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { sendWelcomeEmail } from "../../services/email.service";
import { resolveRoleAlias, acceptedRoleValuesDescription } from "../../utils/orgRoleAliases";
import { adultCutoffDate, calculateAge, isMinor, parseDateOfBirth } from "../../utils/age.util";
import { supportsParentRelationship, getMemberLabel, getCounselorLabel } from "../../utils/orgType.util";
import { riskFromSeverities } from "../../utils/risk.util";
import { linkParentToStudent } from "../parentStudentRelationship.controller";

export const getOrgMembers = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const search = (req.query.search as string) || "";
  const status = (req.query.status as string) || "all";

  const isActiveFilter =
    status === "active" ? true : status === "inactive" ? false : undefined;

  const ageGroup = (req.query.age as string) || "all";
  const cutoff = adultCutoffDate();
  const dobFilter =
    ageGroup === "minors"
      ? { dateOfBirth: { gt: cutoff } }
      : ageGroup === "adults"
      ? { dateOfBirth: { lte: cutoff } }
      : ageGroup === "unknown"
      ? { dateOfBirth: null }
      : {};

  try {
    const students = await prisma.user.findMany({
      where: {
        orgId,
        role: { name: "STUDENT" },
        ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
        ...dobFilter,
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: 50, // default pagination (frontend not sending page yet)
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        dateOfBirth: true,
      },
    });

    const studentIds = students.map((s) => s.id);

    // Biometric activity (wearables)
    const recentBiometrics = await prisma.biometricLog.findMany({
      where: {
        userId: { in: studentIds },
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const connectedSet = new Set(recentBiometrics.map((b) => b.userId));

    // Latest alerts per student
    const alerts = await prisma.alert.findMany({
      where: {
        studentId: { in: studentIds },
        isResolved: false,
      },
      select: {
        studentId: true,
        severity: true,
      },
    });

    const severitiesByStudent = new Map<string, string[]>();
    for (const alert of alerts) {
      const list = severitiesByStudent.get(alert.studentId) ?? [];
      list.push(alert.severity);
      severitiesByStudent.set(alert.studentId, list);
    }

    const results = students.map((student) => {
      const riskLevel = riskFromSeverities(severitiesByStudent.get(student.id) ?? []);

      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
        isActive: student.isActive,
        age: calculateAge(student.dateOfBirth),
        isMinor: isMinor(student.dateOfBirth),
        wearableConnected: connectedSet.has(student.id),
        riskLevel,
      };
    });

    return res.json(results);
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({ message: "Failed to load students" });
  }
};

const createMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  role: z.string().min(1, "Role is required"),
  dateOfBirth: z.string().nullable().optional(),
  parent: z
    .object({
      firstName: z.string().min(1, "Parent first name is required"),
      lastName: z.string().min(1, "Parent last name is required"),
      email: z.string().email("Invalid parent email"),
    })
    .optional(),
});

/**
 * POST /org/members
 * Single-row equivalent of the bulk-enrollment flow: accepts the org's own
 * role vocabulary (Student/Employee/Patient/Member, Counselor/Wellness Coach/
 * Doctor/Support Worker), maps it to the underlying STUDENT/COUNSELOR
 * tier, creates the account with a generated temp password, and emails it.
 */
export const createOrgMember = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const parsed = createMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { firstName, lastName, email, role, parent: parentInput } = parsed.data;

  let dateOfBirth: Date | null;
  try {
    dateOfBirth = parseDateOfBirth(parsed.data.dateOfBirth);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }

  try {
    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { orgType: true, name: true },
    });

    const resolvedRole = resolveRoleAlias(org?.orgType, role);
    if (!resolvedRole) {
      return res.status(400).json({
        message: `Unrecognized role "${role}". Expected ${acceptedRoleValuesDescription(org?.orgType)}.`,
      });
    }

    const dbRole = await prisma.role.findUnique({ where: { name: resolvedRole } });
    if (!dbRole) {
      return res
        .status(500)
        .json({ message: `Role ${resolvedRole} is not configured for this platform` });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const tempPassword = crypto.randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        orgId,
        roleId: dbRole.id,
        mustChangePassword: true,
        dateOfBirth,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    sendWelcomeEmail({
      to: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: resolvedRole === "COUNSELOR"
        ? getCounselorLabel(org?.orgType ?? "")
        : getMemberLabel(org?.orgType ?? ""),
      password: tempPassword,
      orgType: org?.orgType,
      orgName: org?.name ?? undefined,
    }).catch((err) => console.error("Welcome email failed:", user.email, err));

    // Under-18 students need parental consent. When parent details come with the
    // enrollment, link them now — that also sends the consent email. The student
    // account already exists, so a failure here is reported, not thrown.
    const minor = isMinor(dateOfBirth);
    let parentLinked = false;
    let parentError: string | undefined;

    if (
      minor === true &&
      parentInput &&
      resolvedRole === "STUDENT" &&
      supportsParentRelationship(org?.orgType ?? "")
    ) {
      try {
        const link = await linkParentToStudent({
          orgId,
          student: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            org: { orgType: org?.orgType, name: org?.name },
          },
          ...parentInput,
        });
        if (link.ok) parentLinked = true;
        else parentError = link.message;
      } catch (err) {
        console.error("Parent link on enrollment failed:", user.email, err);
        parentError = "Could not link the parent. Link them from the student's profile.";
      }
    }

    return res.status(201).json({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      age: calculateAge(dateOfBirth),
      isMinor: minor,
      parentLinked,
      ...(parentError ? { parentError } : {}),
    });
  } catch (error) {
    console.error("Create member error:", error);
    return res.status(500).json({ message: "Failed to create member" });
  }
};

// PATCH semantics: every field is optional; omitted fields stay as they are.
const updateMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email").optional(),
  isActive: z.boolean().optional(),
  dateOfBirth: z.string().nullable().optional(),
});

/**
 * PATCH /org/members/:studentId
 * Updates a member's own profile fields. Role/enrollment tier is not
 * changeable here — that requires the dedicated enrollment flow.
 */
export const updateOrgMember = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;
  const { studentId } = req.params;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }
  if (!studentId) {
    return res.status(400).json({ message: "studentId is required" });
  }

  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { firstName, lastName, email, isActive } = parsed.data;

  // undefined = leave untouched; null/"" = clear it
  const dobProvided = parsed.data.dateOfBirth !== undefined;
  let dateOfBirth: Date | null = null;
  try {
    dateOfBirth = parseDateOfBirth(parsed.data.dateOfBirth);
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { id: studentId, orgId, role: { name: "STUDENT" } },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Member not found" });
    }

    const emailTaken = email
      ? await prisma.user.findFirst({
          where: { email, NOT: { id: studentId } },
          select: { id: true },
        })
      : null;
    if (emailTaken) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const updated = await prisma.user.update({
      where: { id: studentId },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email }),
        ...(isActive !== undefined && { isActive }),
        ...(dobProvided && { dateOfBirth }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        dateOfBirth: true,
      },
    });

    // Deactivation ends any live sessions; login and refresh also refuse inactive users.
    if (isActive === false) {
      await prisma.refreshToken.deleteMany({ where: { userId: studentId } });
    }

    return res.json({
      id: updated.id,
      name: `${updated.firstName} ${updated.lastName}`,
      email: updated.email,
      isActive: updated.isActive,
      age: calculateAge(updated.dateOfBirth),
      isMinor: isMinor(updated.dateOfBirth),
    });
  } catch (error) {
    console.error("Update member error:", error);
    return res.status(500).json({ message: "Failed to update member" });
  }
};
