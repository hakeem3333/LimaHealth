// src/auth/auth.service.ts
import prisma from "../services/prisma.service";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { sendEmail } from "../services/email.service";
import { generateAccessToken, verifyAccessToken } from "./tokens/accessToken";
import {
  generateRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
} from "./tokens/refreshToken";
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  markPasswordTokenUsed,
} from "./tokens/passwordReset";

const BCRYPT_SALTS = Number(process.env.BCRYPT_SALTS || 10);
const ADMIN_TEMP_SECRET = process.env.JWT_ADMIN_TEMP_SECRET!;
if (!ADMIN_TEMP_SECRET)
  throw new Error("Missing JWT_ADMIN_TEMP_SECRET environment variable");

type LoginStep1Result =
  | {
      role: string;
      requires2FA: true;
      tempToken: string;
    }
  | {
      role: string;
      requires2FA: false;
      token: string;
      refreshToken: string;
      user: ReturnType<typeof sanitizeUser>;
    };

export const sanitizeUser = (user: User) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  firstName: (user as any).firstName,
  lastName: (user as any).lastName,
});

// Roles that require 2FA
const ROLES_REQUIRE_2FA = ["schoolAdmin", "superAdmin"];

/**
 * loginStep1
 * - Validates credentials
 * - If role requires 2FA, create an OTP and tempToken, send OTP by email
 * - If role does NOT require 2FA, return tokens immediately
 */
export const loginStep1 = async (
  email: string,
  password: string
): Promise<LoginStep1Result> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("Invalid credentials");

  // If role requires 2FA -> create OTP and temp token
  if (ROLES_REQUIRE_2FA.includes(user.role)) {
    // generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otpRecord = await prisma.adminOtp.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
        used: false,
      },
    });

    // send OTP email (don't await to block too long? but we await to ensure email attempted)
    await sendEmail({
      to: user.email,
      subject: "Your admin login OTP",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    // create a temporary JWT that identifies the user and otp id
    const tempToken = jwt.sign(
      {
        userId: user.id,
        otpId: otpRecord.id,
        purpose: "ADMIN_2FA",
      },
      ADMIN_TEMP_SECRET,
      { expiresIn: "10m" }
    );

    return {
      role: user.role,
      requires2FA: true,
      tempToken,
    };
  }

  // Role does not require 2FA: regular token issuance
  const token = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    role: user.role,
    requires2FA: false,
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
};

/**
 * loginStep2
 * - Accepts tempToken and otp code
 * - Verifies tempToken, checks OTP record, marks OTP used, issues access + refresh tokens
 */
export const loginStep2 = async (tempToken: string, otpCode: string) => {
  // verify temp token
  let payload: any;
  try {
    payload = jwt.verify(tempToken, ADMIN_TEMP_SECRET) as any;
  } catch (err) {
    throw new Error("Invalid or expired temporary token");
  }

  if (!payload || payload.purpose !== "ADMIN_2FA") {
    throw new Error("Invalid temporary token");
  }

  const { userId, otpId } = payload;

  // fetch OTP record
  const otpRecord = await prisma.adminOtp.findUnique({ where: { id: otpId } });
  if (!otpRecord) throw new Error("Invalid OTP");
  if (otpRecord.userId !== userId) throw new Error("Invalid OTP");
  if (otpRecord.used) throw new Error("OTP already used");
  if (otpRecord.expiresAt < new Date()) throw new Error("OTP expired");
  if (otpRecord.code !== otpCode) {
    // optional: increment failed counter for OTP here
    throw new Error("Invalid OTP");
  }

  // mark OTP used
  await prisma.adminOtp.update({
    where: { id: otpId },
    data: { used: true, usedAt: new Date() as any },
  });

  // fetch user and issue tokens
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const token = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
};

/**
 * login (for non-2FA direct flow; but kept for completeness)
 */
export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("Invalid credentials");

  // If role requires 2FA, instruct controller to call loginStep1 (we still can support)
  if (ROLES_REQUIRE_2FA.includes(user.role)) {
    // you could forward to loginStep1, but here we throw to guide correct flow
    throw new Error("This account requires 2FA. Use loginStep1 flow.");
  }

  const token = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
};

/**
 * Refresh tokens (rotating)
 */
export const refresh = async (oldRefreshToken: string) => {
  // verify exists and not revoked
  const payload = await verifyRefreshToken(oldRefreshToken);

  // rotate refresh token (invalidates old token and creates new one)
  const newRefreshToken = await rotateRefreshToken(oldRefreshToken);

  // get user
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new Error("User not found");

  const newAccess = generateAccessToken(user);

  return { token: newAccess, refreshToken: newRefreshToken };
};

/**
 * Logout (revoke all refresh tokens for user)
 */
export const logout = async (userId: string) => {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
};

/**
 * Forgot password
 */
export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // don't reveal existence

  const token = await generatePasswordResetToken(user.id);

  await sendEmail({
    to: user.email,
    subject: "Password reset request",
    text: `Use this token to reset your password: ${token}. It expires shortly.`,
  });
};

/**
 * Reset password
 */
export const resetPassword = async (token: string, newPassword: string) => {
  const payload = await verifyPasswordResetToken(token);

  const hash = await bcrypt.hash(newPassword, BCRYPT_SALTS);

  // update password
  await prisma.user.update({
    where: { id: payload.userId },
    data: { passwordHash: hash },
  });

  // mark token used
  await markPasswordTokenUsed(payload.id);

  // revoke all refresh tokens for that user (force re-login)
  await prisma.refreshToken.updateMany({
    where: { userId: payload.userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
};
