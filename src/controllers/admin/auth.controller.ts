import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import prisma from "../../services/prisma.service.js";
import { sendVerificationEmail } from "../../services/email.service.js";
import { hashToken } from "../../utils/jwt.util.js";
import type { AuthRequest } from "../../types/models.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const orgSignupSchema = z.object({
  name:          z.string().min(2, "Organisation name must be at least 2 characters"),
  contact_email: z.string().email("Invalid email format"),
  password:      z.string().min(8, "Password must be at least 8 characters"),
  orgType:       z.enum(["SCHOOL", "COMPANY", "HOSPITAL", "NGO"]).default("SCHOOL"),
  firstName:     z.string().min(2, "First name must be at least 2 characters"),
  lastName:      z.string().min(2, "Last name must be at least 2 characters"),
});

const verifyEmailSchema = z.object({
  token: z.string().uuid("Invalid verification token"),
});

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export const orgSignup = async (req: Request, res: Response) => {
  try {
    const parsed = orgSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, contact_email, password, orgType, firstName, lastName } = parsed.data;

    const existingOrg = await prisma.organisation.findFirst({
      where: { OR: [{ contact_email }, { name }] },
    });
    if (existingOrg) {
      return res.status(409).json({ message: "An organisation with this name or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken       = uuidv4();
    const tokenHash      = hashToken(rawToken);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organisation.create({
        data: { name, contact_email, orgType, status: "PENDING_EMAIL_VERIFICATION" },
      });

      const orgAdminRole = await tx.role.findUnique({ where: { name: "ORG_ADMIN" } });
      if (!orgAdminRole) throw new Error("ORG_ADMIN role not found — run seed first");

      await tx.user.create({
        data: {
          firstName,
          lastName,
          email: contact_email,
          passwordHash: hashedPassword,
          isActive: true,
          roleId: orgAdminRole.id,
          orgId: org.id,
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          orgId: org.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      });

      return { org };
    });

    const emailResult = await sendVerificationEmail(contact_email, rawToken, result.org.orgType, result.org.name);

    return res.status(201).json({
      message:     "Signup successful. Please verify your email.",
      orgId:       result.org.id,
      orgType:     result.org.orgType,
      previewLink: emailResult?.preview,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error during signup" });
  }
};

/** @deprecated use orgSignup — kept temporarily for any unconverted route imports */
export const schoolSignup = orgSignup;

// ---------------------------------------------------------------------------
// Verify Email
// ---------------------------------------------------------------------------

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Invalid token" });

    const { token }       = parsed.data;
    const incomingHash    = hashToken(token);

    const record = await prisma.emailVerificationToken.findUnique({
      where:   { tokenHash: incomingHash },
      include: { org: true },
    });

    if (!record) return res.status(404).json({ message: "Verification token invalid or already used." });
    if (record.expiresAt < new Date()) {
      return res.status(410).json({
        message: "Token expired.",
        email: record.org.contact_email,
      });
    }

    await prisma.$transaction([
      prisma.organisation.update({
        where: { id: record.orgId },
        data:  { status: "PENDING_ACTIVATION" },
      }),
      prisma.emailVerificationToken.delete({ where: { id: record.id } }),
    ]);

    return res.json({
      verified: true,
      message:  "Email verified! Your account is pending Super Admin approval.",
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Resend Verification
// ---------------------------------------------------------------------------

export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const org = await prisma.organisation.findUnique({ where: { contact_email: email } });
    if (!org) return res.status(404).json({ message: "Organisation not found" });
    if (org.status !== "PENDING_EMAIL_VERIFICATION") {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const rawToken  = uuidv4();
    const tokenHash = hashToken(rawToken);

    await prisma.$transaction([
      prisma.emailVerificationToken.deleteMany({ where: { orgId: org.id } }),
      prisma.emailVerificationToken.create({
        data: { tokenHash, orgId: org.id, expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000) },
      }),
    ]);

    await sendVerificationEmail(email, rawToken, org.orgType, org.name);
    return res.json({ message: "Verification email resent." });
  } catch (error) {
    return res.status(500).json({ message: "Error resending email" });
  }
};

// ---------------------------------------------------------------------------
// Get Me
// ---------------------------------------------------------------------------

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.user!.id },
      include: { role: true, org: true },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const userData = {
      id:        user.id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      role:      { name: user.role?.name },
      orgId:     user.orgId,
      org:       user.org,
    };

    // Keep the middleware-readable org_status cookie in sync with the DB —
    // it's only ever set at login otherwise, so a status change after login
    // (e.g. payment completing) would leave middleware routing on stale data.
    if (user.org?.status) {
      res.cookie("org_status", user.org.status, {
        httpOnly: false,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        path:     "/",
        maxAge:   7 * 24 * 60 * 60 * 1000,
      });
    }

    if (user.org && user.org.status !== "ACTIVE") {
      return res.status(402).json({
        message: "Payment Required",
        code:    "SUBSCRIPTION_REQUIRED",
        user:    userData,
      });
    }

    return res.status(200).json({ user: userData });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export const adminLogout = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
    }

    const isProd        = process.env.NODE_ENV === "production";
    const cookieOptions = { httpOnly: true, secure: isProd, sameSite: "strict" as const, path: "/" };

    res.clearCookie("access_token",    cookieOptions);
    res.clearCookie("refresh_token",   { ...cookieOptions, path: "/auth/refresh" });
    res.clearCookie("org_status",      { ...cookieOptions, httpOnly: false });
    res.clearCookie("admin_temp_token", cookieOptions);

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ message: "Server error during logout" });
  }
};
