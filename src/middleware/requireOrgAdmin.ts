import type { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware"; // Ensure correct path

/**
 * Middleware to ensure the user is a ORG_ADMIN and
 * is only accessing data belonging to their own organisation.
 */
export const requireOrgAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // 1. Check if user is authenticated (should be handled by 'authenticate' middleware first)
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // 2. Role Check (Updated to match 'role' instead of 'roleName')
  if (req.user.role !== "ORG_ADMIN") {
    return res.status(403).json({
      message: "Access denied: Org Admin privileges required",
    });
  }

  // 3. Multi-tenancy Check (Cross-school protection)
  // Check common places where a orgId might be passed in a request
  const requestedOrgId =
    req.params.orgId || req.body.orgId || req.query.orgId;

  // If a orgId is provided in the request, it MUST match the admin's own orgId
  if (
    requestedOrgId &&
    String(requestedOrgId) !== String(req.user.orgId)
  ) {
    console.warn(
      `Security Warning: User attempted to access organisation ${requestedOrgId}`,
    );

    return res.status(403).json({
      message:
        "Access denied: You do not have permission to access this organisation's data",
    });
  }

  // 4. Context Injection
  // Even if they didn't provide a orgId, we ensure the rest of the app
  // uses the orgId from the verified token
  if (!req.body.orgId) {
    req.body.orgId = req.user.orgId;
  }

  next();
};
