import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { OrgStatus, OrgType } from "@prisma/client";
import { sendOrgApprovedEmail } from "../../services/email.service";

const ROLES = {
  STUDENT: "STUDENT",
  ORG_ADMIN: "ORG_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const uuidSchema = z.string().uuid();

const updateOrganisationSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  status: z.nativeEnum(OrgStatus).optional(),
});

const createOrganisationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("A valid contact email is required"),
  orgType: z.nativeEnum(OrgType),
  status: z.enum([OrgStatus.ACTIVE, OrgStatus.PENDING_ACTIVATION]).default(OrgStatus.ACTIVE),
});

/**
 * POST /super-admin/organisations
 * Creates an organisation directly. A Super Admin is the approver, so the
 * self-signup email-verification step is skipped.
 */
export async function createOrganisation(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = createOrganisationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { name, email, orgType, status } = parsed.data;

    const existing = await prisma.organisation.findFirst({
      where: { OR: [{ contact_email: email }, { name }] },
    });
    if (existing) {
      return res
        .status(409)
        .json({ message: "An organisation with this name or email already exists" });
    }

    const org = await prisma.organisation.create({
      data: { name, contact_email: email, orgType, status },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: ROLES.SUPER_ADMIN,
        action: "CREATE_ORGANISATION",
        targetType: "ORGANISATION",
        targetId: org.id,
        metadata: { name, email, orgType, status },
      },
    }).catch((err) => console.error("Audit log failed:", err));

    return res.status(201).json({
      id: org.id,
      name: org.name,
      email: org.contact_email,
      orgType: org.orgType,
      status: org.status,
      createdAt: org.createdAt,
    });
  } catch (error) {
    console.error("Failed to create organisation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /super-admin/organisations
 * List all organisations with basic metrics
 */
export async function getAllOrgs(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Fetch all organisations with member and admin counts
    const orgs = await prisma.organisation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        contact_email: true,
        orgType: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            users: {
              where: { role: { name: ROLES.STUDENT } },
            },
          },
        },
      },
    });

    const formatted = await Promise.all(
      orgs.map(async (org) => ({
        id: org.id,
        name: org.name,
        email: org.contact_email,
        orgType: org.orgType,
        status: org.status,
        createdAt: org.createdAt,
        membersCount: org._count?.users ?? 0,
        adminsCount: await prisma.user.count({
          where: {
            orgId: org.id,
            role: { name: ROLES.ORG_ADMIN },
          },
        }),
      }))
    );

    return res.json(formatted);
  } catch (error) {
    console.error("Failed to get orgs:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /super-admin/organisations/:orgId
 */
export async function getOrgById(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orgId } = req.params;
    if (!uuidSchema.safeParse(orgId).success) {
      return res.status(400).json({ message: "Invalid orgId" });
    }

    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        contact_email: true,
        orgType: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            users: {
              where: { role: { name: ROLES.STUDENT } },
            },
          },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ message: "Organisation not found" });
    }

    const adminsCount = await prisma.user.count({
      where: {
        orgId: org.id,
        role: { name: ROLES.ORG_ADMIN },
      },
    });

    return res.json({
      id: org.id,
      name: org.name,
      email: org.contact_email,
      orgType: org.orgType,
      status: org.status,
      createdAt: org.createdAt,
      membersCount: org._count?.users ?? 0,
      adminsCount,
    });
  } catch (error) {
    console.error("Failed to get org:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PUT /super-admin/organisations/:orgId
 */
export async function updateOrganisation(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orgId } = req.params;
    if (!uuidSchema.safeParse(orgId).success) {
      return res.status(400).json({ message: "Invalid orgId" });
    }

    const parsed = updateOrganisationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten(),
      });
    }

    // Build update data
    const data: any = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.email) data.contact_email = parsed.data.email;
    if (parsed.data.status) data.status = parsed.data.status;

    const before = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { status: true },
    });
    if (!before) {
      return res.status(404).json({ message: "Organisation not found" });
    }

    const updated = await prisma.organisation.update({
      where: { id: orgId },
      data,
      select: {
        id: true,
        name: true,
        contact_email: true,
        orgType: true,
        status: true,
      },
    });

    // Approval: pending admins are told at login to expect this email.
    if (before.status === OrgStatus.PENDING_ACTIVATION && updated.status === OrgStatus.ACTIVE) {
      const admins = await prisma.user.findMany({
        where: { orgId, isActive: true, role: { name: ROLES.ORG_ADMIN } },
        select: { email: true, firstName: true },
      });
      for (const admin of admins) {
        sendOrgApprovedEmail({
          to: admin.email,
          name: admin.firstName,
          orgName: updated.name,
          orgType: updated.orgType,
        }).catch((err) => console.error("Org approved email failed:", admin.email, err));
      }
    }

    return res.json({
      id: updated.id,
      name: updated.name,
      email: updated.contact_email,
      status: updated.status,
    });
  } catch (error) {
    console.error("Failed to update organisation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
