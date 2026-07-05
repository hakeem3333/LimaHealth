import type { Response } from "express";
import crypto from "crypto";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { sendEmail } from "../../services/email.service";

/**
 * GET /super-admin/admins
 * SuperAdmin-only
 */
export async function listOrgAdmins(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { page = "1", limit = "50" } = req.query;
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.min(Number(limit), 200);

    const admins = await prisma.user.findMany({
      where: {
        role: { name: "ORG_ADMIN" },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        org: {
          select: { name: true },
        },
      },
    });

    const result = admins.map((admin) => ({
      id: admin.id,
      name: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      orgName: admin.org?.name ?? "—",
      status: admin.status ?? "ACTIVE",
      createdAt: admin.createdAt,
    }));

    return res.json({
      page: pageNumber,
      limit: pageSize,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Failed to list org admins:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /super-admin/admins/:id/reset-password
 * SuperAdmin-only
 */
export async function resetAdminPassword(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!process.env.FRONTEND_URL) {
      throw new Error("FRONTEND_URL is not configured");
    }

    const adminId = req.params.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        role: { select: { name: true } },
      },
    });

    if (!admin || admin.role.name !== "ORG_ADMIN") {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Invalidate existing tokens
    await prisma.passwordResetToken.deleteMany({
      where: { userId: admin.id },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: admin.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

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
  } catch (error) {
    console.error("Failed to reset admin password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /super-admin/admins/:id/deactivate
 * SuperAdmin-only
 */
export async function deactivateAdmin(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.params.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        status: true,
        role: { select: { name: true } },
      },
    });

    if (!admin || admin.role.name !== "ORG_ADMIN") {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (admin.status === "INACTIVE") {
      return res.json({ success: true });
    }

    await prisma.user.update({
      where: { id: adminId },
      data: { status: "INACTIVE" },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to deactivate admin:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
