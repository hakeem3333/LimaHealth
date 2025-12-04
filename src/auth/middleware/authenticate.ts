import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../auth.types";

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = { id: data.userId, role: data.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
