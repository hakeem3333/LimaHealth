import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../../services/prisma.service";
import { generateOTP } from "../../../utils/otp.util";
import { sendParentLoginOtpEmail } from "../../../services/email.service";
import {
  signTempToken,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
} from "../../../utils/jwt.util";

const PARENT_OTP_PURPOSE = "PARENT_OTP";

// The generic response never reveals whether the email is registered/a parent —
// this endpoint takes only an email (no password), so it's more enumeration-
// sensitive than a normal login and should behave like forgot-password.
const SAFE_MESSAGE = "If this email has parent access, a sign-in code has been sent.";

// Parent access exists to view a child's wellbeing, which needs that child's
// consent grant — a parent whose consent is pending or declined has nothing to
// see, so they get no sign-in code (same generic response, so no enumeration).
const hasGrantedChild = (parentId: string) =>
  prisma.parentStudentRelationship
    .count({
      where: { parentId, student: { isActive: true, consent: { parentalConsentGiven: true } } },
    })
    .then((n) => n > 0);

const requestOtpSchema = z.object({
  email: z.string().email(),
});

// ---------------------------------------------------------------------------
// POST /auth/parent/login
// Step 1: parent submits their email, gets a 6-digit code by email.
// ---------------------------------------------------------------------------
export const requestParentLoginOtp = async (req: Request, res: Response) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "A valid email is required" });
  }
  const { email } = parsed.data;

  // Temp token always issued (carries only the submitted email), regardless of
  // whether the account exists — step 2 re-checks and fails generically either way.
  const tempToken = signTempToken({ email }, PARENT_OTP_PURPOSE);
  res.cookie("parent_temp_token", tempToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 10 * 60 * 1000,
  });

  // Mobile clients can't rely on the HttpOnly cookie surviving between steps,
  // so hand them the temp token to pass back explicitly (same pattern as the
  // access/refresh tokens returned in the body for X-Client: mobile).
  const isMobile = req.headers["x-client"] === "mobile";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (user && user.role?.name === "PARENT" && user.isActive && (await hasGrantedChild(user.id))) {
      const code = generateOTP();
      const codeHash = await bcrypt.hash(code, 10);

      await prisma.parentLoginOtp.upsert({
        where: { userId: user.id },
        update: { codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
        create: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });

      await sendParentLoginOtpEmail({ to: user.email, name: user.firstName, code }).catch((e) =>
        console.error("[requestParentLoginOtp] email send failed:", e.message),
      );
    }

    return res.status(200).json({ message: SAFE_MESSAGE, ...(isMobile ? { tempToken } : {}) });
  } catch (err) {
    console.error("[requestParentLoginOtp] Error:", err);
    return res.status(200).json({ message: SAFE_MESSAGE, ...(isMobile ? { tempToken } : {}) });
  }
};

const verifyOtpSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only numbers"),
  // Mobile clients pass back the tempToken they got from step 1 (no reliable cookie jar);
  // web clients rely on the HttpOnly cookie instead and omit this.
  tempToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /auth/parent/login/verify
// Step 2: parent submits the code, gets a normal session (same shape as /auth/login).
// ---------------------------------------------------------------------------
export const verifyParentLoginOtp = async (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input" });
  }
  const { otp } = parsed.data;

  const tempToken = req.cookies?.parent_temp_token || parsed.data.tempToken;
  if (!tempToken) {
    return res.status(401).json({ message: "Sign-in session expired. Please request a new code." });
  }

  const { decoded, valid } = verifyToken(tempToken);
  if (!valid || (decoded as any).purpose !== PARENT_OTP_PURPOSE) {
    return res.status(401).json({ message: "Sign-in session expired. Please request a new code." });
  }

  const email = (decoded as any).email as string | undefined;
  const INVALID = { status: 400 as const, message: "Invalid or expired code." };

  try {
    if (!email) return res.status(INVALID.status).json({ message: INVALID.message });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, org: true },
    });
    if (!user || user.role?.name !== "PARENT" || !user.isActive || !(await hasGrantedChild(user.id))) {
      return res.status(INVALID.status).json({ message: INVALID.message });
    }

    const record = await prisma.parentLoginOtp.findUnique({ where: { userId: user.id } });
    if (!record) return res.status(INVALID.status).json({ message: INVALID.message });

    if (record.expiresAt < new Date()) {
      await prisma.parentLoginOtp.delete({ where: { userId: user.id } });
      return res.status(INVALID.status).json({ message: INVALID.message });
    }

    if (record.attempts >= 5) {
      await prisma.parentLoginOtp.delete({ where: { userId: user.id } });
      return res.status(429).json({ message: "Too many attempts. Please request a new code." });
    }

    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.parentLoginOtp.update({
        where: { userId: user.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(INVALID.status).json({ message: INVALID.message });
    }

    await prisma.parentLoginOtp.delete({ where: { userId: user.id } });
    res.clearCookie("parent_temp_token");

    const accessToken = signAccessToken({
      sub: user.id,
      role: "PARENT",
      orgId: user.orgId ?? undefined,
      orgStatus: user.org?.status ?? undefined,
    });
    const refreshToken = signRefreshToken({ sub: user.id });

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const isMobile = req.headers["x-client"] === "mobile";
    const responseBody: Record<string, unknown> = {
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: "PARENT",
        mustChangePassword: false,
        profileImage: user.profileImage,
      },
    };
    if (isMobile) {
      responseBody.accessToken = accessToken;
      responseBody.refreshToken = refreshToken;
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error("[verifyParentLoginOtp] Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
