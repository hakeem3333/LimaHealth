import type { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware"; // Ensure correct path

/**
 * Middleware to ensure the user is a SCHOOL_ADMIN and
 * is only accessing data belonging to their own school.
 */
export const requireSchoolAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // 1. Check if user is authenticated (should be handled by 'authenticate' middleware first)
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // 2. Role Check (Updated to match 'role' instead of 'roleName')
  if (req.user.role !== "SCHOOL_ADMIN") {
    return res.status(403).json({
      message: "Access denied: School Admin privileges required",
    });
  }

  // 3. Multi-tenancy Check (Cross-school protection)
  // Check common places where a schoolId might be passed in a request
  const requestedSchoolId =
    req.params.schoolId || req.body.schoolId || req.query.schoolId;

  // If a schoolId is provided in the request, it MUST match the admin's own schoolId
  if (
    requestedSchoolId &&
    String(requestedSchoolId) !== String(req.user.schoolId)
  ) {
    console.warn(
      `Security Warning: User ${req.user.id} attempted to access school ${requestedSchoolId}`,
    );

    return res.status(403).json({
      message:
        "Access denied: You do not have permission to access this school's data",
    });
  }

  // 4. Context Injection
  // Even if they didn't provide a schoolId, we ensure the rest of the app
  // uses the schoolId from the verified token
  if (!req.body.schoolId) {
    req.body.schoolId = req.user.schoolId;
  }

  next();
};
