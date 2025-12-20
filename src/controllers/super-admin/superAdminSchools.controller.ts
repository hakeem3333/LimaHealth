import type { Response } from "express";
import { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
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
