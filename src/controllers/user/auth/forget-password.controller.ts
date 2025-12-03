import type { Request, Response } from "express";
import prisma from "../../../services/prisma.service.js";
import { sendPasswordResetEmail } from "../../../services/email.service.js";
import crypto from "crypto";

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !["student", "counsellor"].includes(user.role)) {
    return res.json({
      message: "If this email exists, a reset link will be sent",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expire = new Date(Date.now() + 1000 * 60 * 10); // 10 mins

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: expire,
    },
  });

  await sendPasswordResetEmail(user.email, token);

  return res.json({
    message: "If this email exists, a reset link will be sent",
  });
};
