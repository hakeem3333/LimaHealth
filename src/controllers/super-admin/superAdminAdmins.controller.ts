import type { Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { AuthRequest } from "../../types/models";
import prisma from "../../services/prisma.service";
import { sendEmail, sendWelcomeEmail } from "../../services/email.service";

const createAdminSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  orgId: z.string().uuid("Select an organisation"),
});

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
        isActive: true,
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
      status: admin.isActive ? "ACTIVE" : "INACTIVE",
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
 * POST /super-admin/admins
 * SuperAdmin-only. Creates an ORG_ADMIN for an organisation with a generated
 * temp password (mustChangePassword) and emails the login details.
 */
export async function createOrgAdmin(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { firstName, lastName, email, orgId } = parsed.data;

    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, orgType: true },
    });
    if (!org) {
      return res.status(404).json({ message: "Organisation not found" });
    }

    const role = await prisma.role.findUnique({ where: { name: "ORG_ADMIN" } });
    if (!role) {
      return res.status(500).json({ message: "ORG_ADMIN role is not configured" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const tempPassword = crypto.randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const admin = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        orgId: org.id,
        roleId: role.id,
        mustChangePassword: true,
      },
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: "SUPER_ADMIN",
        action: "CREATE_ORG_ADMIN",
        targetType: "USER",
        targetId: admin.id,
        metadata: { email: admin.email, orgId: org.id },
      },
    }).catch((err) => console.error("Audit log failed:", err));

    sendWelcomeEmail({
      to: admin.email,
      name: `${admin.firstName} ${admin.lastName}`,
      role: "Organisation Admin",
      password: tempPassword,
      orgType: org.orgType ?? undefined,
      orgName: org.name,
    }).catch((err) => console.error("Welcome email failed:", admin.email, err));

    return res.status(201).json({
      id: admin.id,
      name: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      orgName: org.name,
      status: "ACTIVE",
      createdAt: admin.createdAt,
    });
  } catch (error) {
    console.error("Failed to create org admin:", error);
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
 * GET /super-admin/admins/:id
 * SuperAdmin-only
 */
export async function getOrgAdminById(req: AuthRequest, res: Response) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const admin = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { name: true } },
        org: { select: { id: true, name: true, orgType: true, status: true } },
      },
    });

    if (!admin || admin.role?.name !== "ORG_ADMIN") {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.json({
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      name: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      status: admin.isActive ? "ACTIVE" : "INACTIVE",
      mustChangePassword: admin.mustChangePassword,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      org: admin.org,
    });
  } catch (error) {
    console.error("Failed to get org admin:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function setAdminActive(req: AuthRequest, res: Response, isActive: boolean) {
  try {
    if (req.user?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.params.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });

    if (!admin || admin.role?.name !== "ORG_ADMIN") {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (admin.isActive === isActive) {
      return res.json({ success: true });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: adminId }, data: { isActive } }),
      // Deactivation ends any live sessions; the refresh handler also refuses inactive admins.
      ...(isActive ? [] : [prisma.refreshToken.deleteMany({ where: { userId: adminId } })]),
    ]);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: "SUPER_ADMIN",
        action: isActive ? "ACTIVATE_ORG_ADMIN" : "DEACTIVATE_ORG_ADMIN",
        targetType: "USER",
        targetId: admin.id,
        metadata: { email: admin.email },
      },
    }).catch((err) => console.error("Audit log failed:", err));

    return res.json({ success: true });
  } catch (error) {
    console.error(`Failed to ${isActive ? "activate" : "deactivate"} admin:`, error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /super-admin/admins/:id/deactivate
 * SuperAdmin-only
 */
export function deactivateAdmin(req: AuthRequest, res: Response) {
  return setAdminActive(req, res, false);
}

/**
 * PATCH /super-admin/admins/:id/activate
 * SuperAdmin-only
 */
export function activateAdmin(req: AuthRequest, res: Response) {
  return setAdminActive(req, res, true);
}
