import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { OrgStatus } from "@prisma/client";

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

    const updated = await prisma.organisation.update({
      where: { id: orgId },
      data,
      select: {
        id: true,
        name: true,
        contact_email: true,
        status: true,
      },
    });

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
