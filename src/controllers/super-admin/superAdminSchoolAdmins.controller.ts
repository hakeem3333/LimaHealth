import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";

const ROLES = {
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const uuidSchema = z.string().uuid();

const assignAdminSchema = z.object({
  adminId: z.string().uuid(),
});

/**
 * GET /super-admin/schools/:schoolId/admins
 */
export async function getSchoolAdmins(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { schoolId } = req.params;
    if (!uuidSchema.safeParse(schoolId).success) {
      return res.status(400).json({ message: "Invalid schoolId" });
    }

    const admins = await prisma.user.findMany({
      where: {
        schoolId,
        role: { name: ROLES.SCHOOL_ADMIN },
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
    console.error("Failed to get school admins:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /super-admin/schools/:schoolId/admins
 */
export async function assignAdminToSchool(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { schoolId } = req.params;
    if (!uuidSchema.safeParse(schoolId).success) {
      return res.status(400).json({ message: "Invalid schoolId" });
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

    if (!admin || admin.role?.name !== ROLES.SCHOOL_ADMIN) {
      return res.status(400).json({ message: "User is not a School Admin" });
    }

    // Optional: check if already assigned to another school
    if (admin.schoolId && admin.schoolId !== schoolId) {
      return res
        .status(400)
        .json({ message: "Admin already assigned to another school" });
    }

    await prisma.user.update({
      where: { id: adminId },
      data: { schoolId },
    });

    return res.json({ message: "Admin assigned successfully" });
  } catch (error) {
    console.error("Failed to assign admin to school:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * DELETE /super-admin/schools/:schoolId/admins/:adminId
 */
export async function removeAdminFromSchool(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { schoolId, adminId } = req.params;
    if (
      !uuidSchema.safeParse(schoolId).success ||
      !uuidSchema.safeParse(adminId).success
    ) {
      return res.status(400).json({ message: "Invalid schoolId or adminId" });
    }

    const admin = await prisma.user.findFirst({
      where: {
        id: adminId,
        schoolId,
        role: { name: ROLES.SCHOOL_ADMIN },
      },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await prisma.user.update({
      where: { id: adminId },
      data: { schoolId: null },
    });

    return res.json({ message: "Admin removed successfully" });
  } catch (error) {
    console.error("Failed to remove admin from school:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
