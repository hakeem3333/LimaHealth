import type { Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../../types/models";
import prisma from "../services/prisma.service";
import { sendEmail } from "../services/email.service";

/**
 * GET /super-admin/admins
 */
export async function listSchoolAdmins(req: AuthRequest, res: Response) {
  const admins = await prisma.user.findMany({
    where: {
      role: { name: "SCHOOL_ADMIN" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      createdAt: true,
      school: {
        select: { name: true },
      },
    },
  });

  const result = admins.map((a) => ({
    id: a.id,
    name: `${a.firstName} ${a.lastName}`,
    email: a.email,
    schoolName: a.school?.name ?? "—",
    status: a.status ?? "ACTIVE",
    createdAt: a.createdAt,
  }));

  return res.json(result);
}

/**
 * POST /super-admin/admins/:id/reset-password
 */
export async function resetAdminPassword(req: AuthRequest, res: Response) {
  const adminId = req.params.id;

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, role: { select: { name: true } } },
  });

  if (!admin || admin.role.name !== "SCHOOL_ADMIN") {
    return res.status(404).json({ message: "Admin not found" });
  }

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: admin.id,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 min
    },
  });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: admin.email,
    subject: "Reset your admin password",
    html: `
      <p>You requested a password reset.</p>
      <p>
        <a href="${resetUrl}">Click here to reset your password</a>
      </p>
      <p>This link expires in 30 minutes.</p>
    `,
  });

  return res.json({ success: true });
}

/**
 * PATCH /super-admin/admins/:id/deactivate
 */
export async function deactivateAdmin(req: AuthRequest, res: Response) {
  const adminId = req.params.id;

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: { select: { name: true } } },
  });

  if (!admin || admin.role.name !== "SCHOOL_ADMIN") {
    return res.status(404).json({ message: "Admin not found" });
  }

  await prisma.user.update({
    where: { id: adminId },
    data: { status: "INACTIVE" },
  });

  return res.json({ success: true });
}
