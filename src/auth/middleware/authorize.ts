import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../auth.types";

export const authorize = (roles: string | string[]) => {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: Access denied" });
    }

    next();
  };
};
