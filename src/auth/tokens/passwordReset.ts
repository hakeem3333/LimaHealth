import prisma from "../../services/prisma.service";
import crypto from "crypto";
import jwt from "jsonwebtoken";

export const generatePasswordResetToken = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10), // 10 minutes
    },
  });

  return token;
};

export const verifyPasswordResetToken = async (token: string) => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!record) throw new Error("Invalid token");
  if (record.expiresAt < new Date()) throw new Error("Token expired");

  return { userId: record.userId };
};
