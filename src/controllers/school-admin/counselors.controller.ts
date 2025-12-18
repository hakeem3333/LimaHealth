import { Response } from "express";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const listCounselors = async (req: AuthRequest, res: Response) => {
  const schoolId = req.user?.schoolId;
  const { search } = req.query as { search?: string };

  if (!schoolId) {
    return res.status(403).json({ message: "School access required" });
  }

  try {
    // Find counselors in this school
    const counselors = await prisma.user.findMany({
      where: {
        schoolId,
        role: { name: "COUNSELOR" },
        OR: search
          ? [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        alertsAsCounselor: {
          select: { id: true },
        },
      },
      orderBy: { firstName: "asc" },
    });

    const data = counselors.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      isActive: c.isActive,
      studentsCount: c.alertsAsCounselor.length, // number of students assigned via alerts
    }));

    res.json(data);
  } catch (error) {
    console.error("List counselors error:", error);
    res.status(500).json({ message: "Failed to fetch counselors" });
  }
};
