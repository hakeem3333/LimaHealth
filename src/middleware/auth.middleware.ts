import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import prisma from "../services/prisma.service";

export type AuthRequest = Request & {
  user?: {
    id: string;
    email?: string;
    role: string;
    schoolId?: string;
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
    const token = req.cookies.access_token;

    if (!token) {
      console.log("DEBUG [Auth Middleware]: No access_token cookie found.");
      return res.status(401).json({ message: "Authentication required" });
    }

    const { decoded, valid, error } = verifyToken(token);

    if (!valid || !decoded) {
      console.log("DEBUG [Auth Middleware]: Token invalid. Error:", error);
      return res.status(401).json({
        message:
          error === "TokenExpiredError" ? "Session expired" : "Invalid token",
      });
    }

    const payload = decoded as any;
    const userId = payload.sub || payload.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      console.log(
        `DEBUG [Auth Middleware]: User ${userId} check failed. Exists: ${!!user}, Has Role: ${!!user?.role}, Has School: ${!!user?.schoolId}`,
      );
      return res
        .status(401)
        .json({ message: "User no longer exists or lacks permissions" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      schoolId: user.schoolId,
      permissions: user.role.permissions.map((p) => p.permission.name),
    };

    next();
  } catch (err) {
    console.error("DEBUG [Auth Middleware]: CRITICAL ERROR:", err);
    return res.status(500).json({ message: "Internal auth error" });
  }
};

/* -----------------------------
   Authenticate Super Admin
------------------------------ */

export const authenticateSuperAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies.super_access_token;
    console.log("DEBUG [SuperAdmin Auth]: Checking for super_access_token...");

    if (!token) {
      console.log(
        "DEBUG [SuperAdmin Auth]: No super_access_token cookie found.",
      );
      return res.status(401).json({ message: "Super Admin access required" });
    }

    const { decoded, valid, error } = verifyToken(token);

    if (!valid || (decoded as any).role !== "SUPER_ADMIN") {
      console.log(
        `DEBUG [SuperAdmin Auth]: Token invalid or role mismatch. Role in JWT: ${(decoded as any)?.role}. Error: ${error}`,
      );
      return res
        .status(401)
        .json({ message: "Invalid or unauthorized session" });
    }

    const userId = (decoded as any).sub || (decoded as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.role.name !== "SUPER_ADMIN") {
      console.log(
        `DEBUG [SuperAdmin Auth]: DB check failed. User found: ${!!user}, Actual Role: ${user?.role.name}`,
      );
      return res
        .status(403)
        .json({ message: "Access restricted to Super Admins" });
    }

    req.user = {
      id: user.id,
      email: user.email!,
      role: user.role.name,
      schoolId: user.schoolId!,
      permissions: [],
    };

    console.log("DEBUG [SuperAdmin Auth]: Verification successful.");
    next();
  } catch (err) {
    console.error("DEBUG [SuperAdmin Auth]: CRITICAL ERROR:", err);
    return res.status(500).json({ message: "Internal auth error" });
  }
};

/* -----------------------------
   Permission & Role Helpers
------------------------------ */

export const authorizeRole =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      console.log(
        `DEBUG [Role Guard]: Access denied. User role: ${req.user?.role}. Allowed: ${allowedRoles}`,
      );
      return res
        .status(403)
        .json({ message: "Access denied: Insufficient role" });
    }
    next();
  };

export const hasPermission =
  (...requiredPermissions: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permissions || [];
    const hasMatch = requiredPermissions.some((p) =>
      userPermissions.includes(p),
    );

    if (!hasMatch) {
      console.log(
        `DEBUG [Permission Guard]: Access denied. Required: ${requiredPermissions}. User has: ${userPermissions}`,
      );
      return res
        .status(403)
        .json({ message: "Access denied: Missing permissions" });
    }
    next();
  };
