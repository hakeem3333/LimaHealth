import type { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

export const requireSchoolAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.roleName !== "SCHOOL_ADMIN") {
    return res.status(403).json({
      message: "Forbidden: School Admin only",
    });
  }

  const requestedSchoolId =
    req.params.schoolId || req.body.schoolId || req.query.schoolId;

  if (requestedSchoolId && requestedSchoolId !== req.user.schoolId) {
    return res.status(403).json({
      message: "Access denied: cross-school access blocked",
    });
  }

  next();
};
