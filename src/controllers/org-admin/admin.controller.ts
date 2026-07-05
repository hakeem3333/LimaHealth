import type { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import type { AuthRequest } from "../../middleware/auth.middleware";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changeAdminPassword(req: AuthRequest, res: Response) {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { currentPassword, newPassword } = parsed.data;

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1. Fetch user and their org status
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { org: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🛡️ 2. Lifecycle Guard
    // We allow PASSWORD CHANGES for ACTIVE, PAYMENT_REQUIRED, and EXPIRED.
    // We BLOCK for SUSPENDED or PENDING_ACTIVATION.
    if (user.org) {
      const status = user.org.status;
      if (status === "SUSPENDED") {
        return res
          .status(403)
          .json({ message: "Account suspended. Contact support." });
      }
      if (status === "PENDING_ACTIVATION") {
        return res.status(403).json({ message: "Account pending activation." });
      }
    }

    // 3. Verify current password
    const passwordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!passwordValid) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    // 4. Update password
    const newHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return res.json({
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
