import type { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
/**
 * GET /super-admin/schools/:schoolId/admins
 */
export async function getSchoolAdmins(req: AuthRequest, res: Response) {
  const { schoolId } = req.params;

  const admins = await prisma.user.findMany({
    where: {
      schoolId,
      role: {
        name: "SCHOOL_ADMIN",
      },
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
}

const assignAdminSchema = z.object({
  adminId: z.string().uuid(),
});

/**
 * POST /super-admin/schools/:schoolId/admins
 */
export async function assignAdminToSchool(
  req: AuthRequest,
  res: Response
) {
  const { schoolId } = req.params;

  const parsed = assignAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid adminId" });
  }

  const { adminId } = parsed.data;

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: { role: true },
  });

  if (!admin || admin.role?.name !== "SCHOOL_ADMIN") {
    return res
      .status(400)
      .json({ message: "User is not a School Admin" });
  }

  await prisma.user.update({
    where: { id: adminId },
    data: { schoolId },
  });

  return res.json({ message: "Admin assigned successfully" });
}

/**
 * DELETE /super-admin/schools/:schoolId/admins/:adminId
 */
export async function removeAdminFromSchool(
  req: AuthRequest,
  res: Response
) {
  const { schoolId, adminId } = req.params;

  const admin = await prisma.user.findFirst({
    where: {
      id: adminId,
      schoolId,
      role: { name: "SCHOOL_ADMIN" },
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
}
