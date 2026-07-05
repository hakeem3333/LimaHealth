import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

const ROLES = {
  ORG_ADMIN: "ORG_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const uuidSchema = z.string().uuid();

const assignAdminSchema = z.object({
  adminId: z.string().uuid(),
});

/**
 * GET /super-admin/organisations/:orgId/admins
 */
export async function getOrgAdmins(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orgId } = req.params;
    if (!uuidSchema.safeParse(orgId).success) {
      return res.status(400).json({ message: "Invalid orgId" });
    }

    const admins = await prisma.user.findMany({
      where: {
        orgId,
        role: { name: ROLES.ORG_ADMIN },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    return res.json(
      admins.map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.email,
      }))
    );
  } catch (error) {
    console.error("Failed to get org admins:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /super-admin/organisations/:orgId/admins
 */
export async function assignAdminToOrg(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orgId } = req.params;
    if (!uuidSchema.safeParse(orgId).success) {
      return res.status(400).json({ message: "Invalid orgId" });
    }

    const parsed = assignAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid adminId" });
    }
    const { adminId } = parsed.data;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!admin || admin.role?.name !== ROLES.ORG_ADMIN) {
      return res.status(400).json({ message: "User is not a Org Admin" });
    }

    // Optional: check if already assigned to another organisation
    if (admin.orgId && admin.orgId !== orgId) {
      return res
        .status(400)
        .json({ message: "Admin already assigned to another organisation" });
    }

    await prisma.user.update({
      where: { id: adminId },
      data: { orgId },
    });

    return res.json({ message: "Admin assigned successfully" });
  } catch (error) {
    console.error("Failed to assign admin to organisation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * DELETE /super-admin/organisations/:orgId/admins/:adminId
 */
export async function removeAdminFromOrg(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { orgId, adminId } = req.params;
    if (
      !uuidSchema.safeParse(orgId).success ||
      !uuidSchema.safeParse(adminId).success
    ) {
      return res.status(400).json({ message: "Invalid orgId or adminId" });
    }

    const admin = await prisma.user.findFirst({
      where: {
        id: adminId,
        orgId,
        role: { name: ROLES.ORG_ADMIN },
      },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await prisma.user.update({
      where: { id: adminId },
      data: { orgId: null },
    });

    return res.json({ message: "Admin removed successfully" });
  } catch (error) {
    console.error("Failed to remove admin from organisation:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
