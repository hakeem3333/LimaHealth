import { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../services/prisma.service";
import { AuthRequest } from "../../middleware/auth.middleware";

const BCRYPT_SALT_ROUNDS = 12;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(6, "Current password must be at least 6 characters"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/,
        "Password must include uppercase, lowercase, number, and special character"
      ),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changeAdminPassword(req: AuthRequest, res: Response) {
  const { success, data, error } = changePasswordSchema.safeParse(req.body);

  if (!success) {
    return res.status(400).json({
      message: "Validation error",
      errors: error.flatten(),
    });
  }

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: "User not found" });
    }

    const passwordValid = await bcrypt.compare(
      data.currentPassword,
      user.passwordHash
    );
    if (!passwordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    if (data.currentPassword === data.newPassword) {
      return res
        .status(400)
        .json({
          message: "New password cannot be the same as current password",
        });
    }

    const newHash = await bcrypt.hash(data.newPassword, BCRYPT_SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Optional: invalidate old sessions / tokens here

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error changing password:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
