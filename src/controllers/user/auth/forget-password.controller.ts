import { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { sendMail } from "../lib/mailer";
import crypto from "crypto";
import { hashPassword } from "../utils/hash";

export const forgotPassword = async (req, res) => {
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

  const resetLink = `https://yourfrontend.com/reset-password/${token}`;

  await sendMail(
    user.email,
    "Password Reset",
    `Click to reset your password: ${resetLink}`
  );

  res.json({
    message: "If this email exists, a reset link will be sent",
  });
};
