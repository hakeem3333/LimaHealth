import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import prisma from "../services/prisma.service";

export type AuthRequest = Request & {
  user?: {
    id: string;
    email?: string;
    role: string;
    orgId?: string;
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
    // Web clients authenticate via HttpOnly cookie; mobile clients (which can't
    // store HttpOnly cookies) send the access token as a Bearer header instead.
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.cookies.access_token || bearerToken;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { decoded, valid, error } = verifyToken(token);

    if (!valid || !decoded) {
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
        orgId: true,
        mustChangePassword: true,
        org: {
          select: { status: true },
        },
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

    if (!user || !user.role) {
      return res.status(401).json({ message: "User account no longer exists" });
    }

    // Accounts created with a temporary password must set their own before doing
    // anything else. This is a mobile-app rule only: web clients are never forced.
    const isMobileClient = req.headers["x-client"] === "mobile";
    const isChangePasswordCall =
      req.method === "POST" &&
      req.originalUrl.split("?")[0]?.endsWith("/auth/change-password");

    if (isMobileClient && user.mustChangePassword && !isChangePasswordCall) {
      return res.status(403).json({
        message: "Please change your temporary password before continuing.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }

    if (user.orgId && user.org) {
      const status = user.org.status;

      const isBillingAction =
        req.originalUrl.includes("/billing/initialize") ||
        req.originalUrl.includes("/billing/status");

      if (status === "PENDING_ACTIVATION") {
        return res
          .status(403)
          .json({ message: "Your organisation is awaiting admin approval." });
      }

      if (status === "PAYMENT_REQUIRED" && !isBillingAction) {
        return res.status(402).json({
          message: "Payment Required",
          code: "SUBSCRIPTION_REQUIRED",
          user: {
            id: user.id,
            email: user.email,
            orgId: user.orgId,
            role: user.role.name,
          },
        });
      }

      if (status === "EXPIRED" && !isBillingAction) {
        return res.status(402).json({
          message: "Subscription Expired",
          code: "SUBSCRIPTION_EXPIRED",
          user: {
            id: user.id,
            email: user.email,
            orgId: user.orgId,
            role: user.role.name,
          },
        });
      }

      if (status === "SUSPENDED") {
        return res
          .status(403)
          .json({ message: "Organisation access has been suspended." });
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      orgId: user.orgId || undefined,
      permissions: user.role.permissions.map((p) => p.permission.name),
    };

    next();
  } catch (err) {
    console.error("[Auth Middleware] Error:", err);
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

    if (!token) {
      return res.status(401).json({ message: "Super Admin access required" });
    }

    const { decoded, valid } = verifyToken(token);

    if (
      !valid ||
      (decoded as any).type !== "ACCESS" ||
      (decoded as any).role !== "SUPER_ADMIN"
    ) {
      return res
        .status(401)
        .json({ message: "Invalid or unauthorized session" });
    }

    const userId = (decoded as any).sub || (decoded as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.role?.name !== "SUPER_ADMIN") {
      return res
        .status(403)
        .json({ message: "Access restricted to Super Admins" });
    }

    req.user = {
      id: user.id,
      email: user.email!,
      role: user.role.name,
      orgId: user.orgId || undefined,
      permissions: [],
    };

    next();
  } catch (err) {
    console.error("[SuperAdmin Auth] Error:", err);
    return res.status(500).json({ message: "Internal auth error" });
  }
};

/* -----------------------------
   Permission & Role Helpers
------------------------------ */

export const authorizeRole =
  (...allowedRoles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!req.user || !userRole || !allowedRoles.includes(userRole)) {
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
      return res
        .status(403)
        .json({ message: "Access denied: Missing permissions" });
    }
    next();
  };
