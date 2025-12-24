import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../services/prisma.service";
import { z } from "zod";

/**
 * Custom Request interface
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

/* -----------------------------
   Zod Schemas
------------------------------ */

// Authorization header validator
const authHeaderSchema = z.object({
  authorization: z
    .string()
    .startsWith("Bearer ", {
      message: "Authorization header must start with Bearer",
    })
    .optional(),
});

// JWT payload validator
const jwtPayloadSchema = z
  .object({
    userId: z.string().optional(),
    id: z.string().optional(),
  })
  .refine((payload) => payload.userId || payload.id, {
    message: "Token must contain userId or id",
  });

/* -----------------------------
   Authenticate Middleware
------------------------------ */

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

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // Validate payload
    const payload = jwtPayloadSchema.parse(decoded);
    const userId = payload.userId || payload.id;

    // Load user + role + permissions from DB (source of truth)
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user.roleId || !user.role) {
      return res.status(403).json({ message: "User has no assigned role" });
    }

    const permissions =
      user.role.permissions.map((rp) => rp.permission.name) ?? [];

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
    console.error("Auth error:", (err as Error).message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/* -----------------------------
   Permission Middleware
------------------------------ */

export const authorize =
  (...requiredPermissions: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userPermissions = req.user.permissions ?? [];

    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({
        message: "Forbidden: Insufficient permissions",
      });
    }

    next();
  };

export const authorizeAll =
  (...requiredPermissions: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permissions ?? [];

    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAll) {
      return res.status(403).json({
        message: "Forbidden: Missing required permissions",
      });
    }

    next();
  };

export const authorizeRole =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.roleName) {
      return res.status(401).json({ message: "User role missing" });
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({
        message: "Forbidden: Role access denied",
      });
    }

    next();
  };
