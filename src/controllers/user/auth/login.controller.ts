import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../../services/prisma.service";
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "../../../utils/jwt.util";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const login = async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        org: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const allowedRoles = ["COUNSELOR", "STUDENT", "PARENT"];
    const userRole = user.role?.name ?? "";

    if (!allowedRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ message: "Access denied for this account type" });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: userRole,
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

    // Mobile clients can't access HttpOnly cookies, so we also return tokens
    // in the body when the X-Client: mobile header is present.
    const isMobile = req.headers["x-client"] === "mobile";

    const responseBody: Record<string, unknown> = {
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        role: userRole,
      },
    };

    if (isMobile) {
      responseBody.accessToken = accessToken;
      responseBody.refreshToken = refreshToken;
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
