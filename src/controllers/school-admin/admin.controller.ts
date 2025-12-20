import type { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changeAdminPassword(req: AuthRequest, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation error",
      errors: parsed.error.flatten(),
    });
  }

  const { currentPassword, newPassword } = parsed.data;

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const passwordValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash
  );

  if (!passwordValid) {
    return res.status(400).json({
      message: "Current password is incorrect",
    });
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  return res.json({
    message: "Password updated successfully",
  });
}
