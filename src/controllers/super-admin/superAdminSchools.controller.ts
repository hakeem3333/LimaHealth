import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { SchoolStatus } from "@prisma/client";

const ROLES = {
  STUDENT: "STUDENT",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

const uuidSchema = z.string().uuid();

const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  status: z.nativeEnum(SchoolStatus).optional(),
});

/**
 * GET /super-admin/schools
 * List all schools with basic metrics
 */
export async function getAllSchools(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Fetch schools with counts for students and admins
    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        contact_email: true,
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
      schools.map(async (school) => ({
        id: school.id,
        name: school.name,
        email: school.contact_email,
        status: school.status,
        createdAt: school.createdAt,
        studentsCount: school._count?.users ?? 0,
        adminsCount: await prisma.user.count({
          where: {
            schoolId: school.id,
            role: { name: ROLES.SCHOOL_ADMIN },
          },
        }),
      }))
    );


    return res.json(formatted);
  } catch (error) {
    console.error("Failed to get schools:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /super-admin/schools/:schoolId
 */
export async function getSchoolById(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { schoolId } = req.params;
    if (!uuidSchema.safeParse(schoolId).success) {
      return res.status(400).json({ message: "Invalid schoolId" });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        contact_email: true,
        status: true,
      },
    });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    return res.json({
      id: school.id,
      name: school.name,
      email: school.contact_email,
      status: school.status,
    });
  } catch (error) {
    console.error("Failed to get school:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PUT /super-admin/schools/:schoolId
 */
export async function updateSchool(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { schoolId } = req.params;
    if (!uuidSchema.safeParse(schoolId).success) {
      return res.status(400).json({ message: "Invalid schoolId" });
    }

    const parsed = updateSchoolSchema.safeParse(req.body);
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

    const updated = await prisma.school.update({
      where: { id: schoolId },
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
    console.error("Failed to update school:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
