import type { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { SchoolStatus } from "@prisma/client";
/**
 * GET /super-admin/schools
 * List all schools with basic metrics
 */
export async function getAllSchools(req: AuthRequest, res: Response) {
  const schools = await prisma.school.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      contact_email: true,
      status: true,
      createdAt: true,
      users: {
        select: {
          role: {
            select: { name: true },
          },
        },
      },
    },
  });

  const formatted = schools.map((school) => {
    const studentsCount = school.users.filter(
      (u) => u.role?.name === "STUDENT"
    ).length;

    const adminsCount = school.users.filter(
      (u) => u.role?.name === "SCHOOL_ADMIN"
    ).length;

    return {
      id: school.id,
      name: school.name,
      email: school.contact_email,
      status: school.status,
      createdAt: school.createdAt,
      studentsCount,
      adminsCount,
    };
  });

  return res.json(formatted);
}

/**
 * GET /super-admin/schools/:schoolId
 */
export async function getSchoolById(
  req: AuthRequest,
  res: Response
) {
  const { schoolId } = req.params;

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
}

const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  status: z.nativeEnum(SchoolStatus).optional(),
});


/**
 * PUT /super-admin/schools/:schoolId
 */
export async function updateSchool(
  req: AuthRequest,
  res: Response
) {
  const { schoolId } = req.params;

  const parsed = updateSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.flatten(),
    });
  }

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
}
