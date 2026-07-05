import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../services/prisma.service.js";
import { hashToken } from "../utils/jwt.util.js";
import { sendEmail } from "../services/email.service.js";

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:3001";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token:       z.string().min(32),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------
export const forgotPassword = async (req: Request, res: Response) => {
  // Always return 200 regardless of whether the email exists (prevents enumeration)
  const SAFE_RESPONSE = res.status(200).json({
    message: "If this email is registered, a reset link has been sent.",
  });

  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return SAFE_RESPONSE;

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true },
    });

    if (!user) return SAFE_RESPONSE; // silently no-op

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Generate a secure random token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId:    user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${FRONTEND_BASE_URL}/reset-password?token=${rawToken}`;

    await sendEmail({
      to: email,
      subject: "Reset your LimaHealth password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:480px">
          <h2 style="color:#2563EB">Password Reset Request</h2>
          <p>Hi ${user.firstName},</p>
          <p>We received a request to reset your password. Click the button below within <strong>1 hour</strong>:</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}"
               style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
              Reset Password
            </a>
          </p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#9CA3AF;font-size:12px">— LimaHealth</p>
        </div>
      `,
    });

    return SAFE_RESPONSE;
  } catch (err) {
    console.error("[forgotPassword] Error:", err);
    return SAFE_RESPONSE; // still don't reveal server errors
  }
};

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------
export const resetPassword = async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message || "Invalid input",
    });
  }

  const { token, newPassword } = parsed.data;

  try {
    const tokenHash = hashToken(token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid or expired reset link." });
    }

    if (record.usedAt) {
      return res.status(400).json({ message: "This reset link has already been used." });
    }

    if (record.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { tokenHash } });
      return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
      // Invalidate all active sessions for security
      prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return res.status(200).json({ message: "Password reset successfully. Please log in." });
  } catch (err) {
    console.error("[resetPassword] Error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};
