import type { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";
import { sendWelcomeEmail } from "../../services/email.service";
import { resolveRoleAlias, acceptedRoleValuesDescription } from "../../utils/orgRoleAliases";

export const getOrgMembers = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.orgId;

  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  const search = (req.query.search as string) || "";
  const status = (req.query.status as string) || "all";

  const isActiveFilter =
    status === "active" ? true : status === "inactive" ? false : undefined;

  try {
    const students = await prisma.user.findMany({
      where: {
        orgId,
        role: { name: "STUDENT" },
        ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
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
      orderBy: { createdAt: "desc" },
      select: {
        studentId: true,
        alertType: true,
      },
    });

    const alertMap = new Map<string, string>();

    for (const alert of alerts) {
      if (!alertMap.has(alert.studentId)) {
        alertMap.set(alert.studentId, alert.alertType);
      }
    }

    const results = students.map((student) => {
      const alertType = alertMap.get(student.id);

      let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

      if (alertType === "CRITICAL" || alertType === "HIGH") {
        riskLevel = "HIGH";
      } else if (alertType === "MEDIUM") {
        riskLevel = "MEDIUM";
      }

      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
        isActive: student.isActive,
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
});

/**
 * POST /org/members
 * Single-row equivalent of the bulk-enrollment flow: accepts the org's own
 * role vocabulary (Student/Employee/Staff/Member, Counselor/Wellness Coach/
 * Therapist/Support Worker), maps it to the underlying STUDENT/COUNSELOR
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
  const { firstName, lastName, email, role } = parsed.data;

  try {
    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { orgType: true },
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
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    sendWelcomeEmail({
      to: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: resolvedRole,
      password: tempPassword,
    }).catch((err) => console.error("Welcome email failed:", user.email, err));

    return res.status(201).json({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    });
  } catch (error) {
    console.error("Create member error:", error);
    return res.status(500).json({ message: "Failed to create member" });
  }
};
