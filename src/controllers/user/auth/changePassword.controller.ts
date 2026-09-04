import type { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../../services/prisma.service";
import type { AuthRequest } from "../../../middleware/auth.middleware";

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

// Used by students/counselors/parents — including the forced first-login
// change for accounts created with a temp password (see bulkUpload.controller.ts).
export async function changePassword(req: AuthRequest, res: Response) {
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

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const passwordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!passwordValid) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
