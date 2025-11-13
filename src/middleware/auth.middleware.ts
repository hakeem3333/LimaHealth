import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../services/prisma.service";

/**
 * Custom Request interface to include the authenticated user object.
 * This MUST be exported as a named export.
 */
export type AuthRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    schoolId?: string;
  };
};

/**
 * Middleware for authenticating users via JWT token in the Authorization header.
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId?: string; // <-- make this optional
      id?: string; // in case the token used 'id' instead of 'userId'
    };

    // ✅ Support both possible token shapes
    const id = decoded.userId || decoded.id;
    if (!id) {
      console.error("JWT missing userId/id:", decoded);
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });
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
