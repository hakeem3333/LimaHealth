import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util"; // Use our ESM-safe utility
import prisma from "../services/prisma.service";

/**
 * Enhanced Custom Request interface
 */
export type AuthRequest = Request & {
  user?: {
    id: string;
    email?: string;
    role: string;
    schoolId: string;
    permissions: string[];
  };
};

/* -----------------------------
   Authenticate Middleware
------------------------------ */

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // 1. Extract from Cookie (instead of Header)
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // 2. Verify JWT via Utility
    const { decoded, valid, error } = verifyToken(token);

    if (!valid || !decoded) {
      return res.status(401).json({
        message:
          error === "TokenExpiredError" ? "Session expired" : "Invalid token",
      });
    }

    const payload = decoded as any;

    // 3. Optional: Cache/Fetch User from DB
    // To save performance, we can trust the JWT for 15 mins
    // Or fetch fresh roles if security is critical:
    const user = await prisma.user.findUnique({
      where: { id: payload.sub || payload.userId },
      select: {
        id: true,
        email: true,
        schoolId: true,
        role: {
          select: {
            name: true,
            permissions: {
              select: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!user || !user.role || !user.schoolId) {
      return res
        .status(401)
        .json({ message: "User no longer exists or lacks permissions" });
    }

    // 4. Attach to Request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      schoolId: user.schoolId,
      permissions: user.role.permissions.map((p) => p.permission.name),
    };

    next();
  } catch (err) {
    console.error("Middleware Auth Error:", err);
    return res.status(500).json({ message: "Internal auth error" });
  }
};

/* -----------------------------
   Permission & Role Helpers
------------------------------ */

// Check if user has AT LEAST ONE of these roles
export const authorizeRole =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied: Insufficient role" });
    }
    next();
  };

// Check if user has AT LEAST ONE of these permissions
export const hasPermission =
  (...requiredPermissions: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permissions || [];
    const hasMatch = requiredPermissions.some((p) =>
      userPermissions.includes(p),
    );

    if (!hasMatch) {
      return res
        .status(403)
        .json({ message: "Access denied: Missing permissions" });
    }
    next();
  };
