import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../services/prisma.service";
import { z } from "zod";

/**
 * Custom Request interface to include the authenticated user object.
 */
export type AuthRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    schoolId?: string;
  };
};

// Zod schema to validate the Authorization header
const authHeaderSchema = z.object({
  authorization: z
    .string()
    .startsWith("Bearer ", {
      message: "Authorization header must start with Bearer",
    }),
});

// Zod schema to validate JWT payload
const jwtPayloadSchema = z.object({
  userId: z.string().optional(),
  id: z.string().optional(),
});

/**
 * Middleware for authenticating users via JWT token in the Authorization header.
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate headers
    authHeaderSchema.parse(req.headers);

    const token = req.headers.authorization!.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Validate JWT payload
    const payload = jwtPayloadSchema.parse(decoded);

    const id = payload.userId || payload.id;
    if (!id) {
      console.error("JWT missing userId/id:", decoded);
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(401).json({ message: "Invalid token" });

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/**
 * Middleware for authorizing roles.
 */
export const authorize =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user)
      return res
        .status(401)
        .json({ message: "Unauthorized: User object missing" });

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    next();
  };
