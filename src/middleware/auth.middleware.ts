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
    roleId: string | null;
    roleName?: string | null;
    schoolId?: string | null;
    permissions?: string[];
  };
};

// Authorization header validator
const authHeaderSchema = z.object({
  authorization: z
    .string()
    .startsWith("Bearer ", {
      message: "Authorization header must start with Bearer",
    })
    .optional(),
});

// JWT payload validator (ensure at least one id exists)
const jwtPayloadSchema = z
  .object({
    userId: z.string().optional(),
    id: z.string().optional(),
  })
  .refine((payload) => payload.userId || payload.id, {
    message: "Token must contain userId or id",
  });

/**
 * Authentication Middleware — validates JWT and loads user info + permissions.
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate header format
    authHeaderSchema.parse(req.headers);

    if (!req.headers.authorization) {
      return res.status(401).json({ message: "Missing Authorization header" });
    }

    const token = req.headers.authorization.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate JWT structure
    const payload = jwtPayloadSchema.parse(decoded);
    const id = payload.userId || payload.id;

    // Load user with optimized permission select
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Ensure user has a role
    if (!user.roleId || !user.role) {
      return res.status(403).json({ message: "User has no assigned role" });
    }

    const permissions =
      user.role.permissions.map((rp) => rp.permission.name) || [];

    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      schoolId: user.schoolId,
      permissions,
    };

    next();
  } catch (err) {
    console.error("Auth error:", (err as any).message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/**
 * Authorization Middleware — checks for required permissions.
 * Example: authorize("manage_schools")
 */
export const authorize =
  (...requiredPermissions: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not authenticated" });
    }

    const userPermissions = req.user.permissions || [];

    // User must have *at least one* of the permissions
    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({
        message:
          "Forbidden: You do not have permission to access this resource",
      });
    }

    next();
  };
