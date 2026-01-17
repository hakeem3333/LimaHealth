import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Enhanced Zod validation middleware.
 * Supports body, query, and params validation.
 */
const validate =
  (schema: ZodSchema, target: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Parse and Transform
      // We assign the result back to req[target] so that .transform()
      // and .default() values are available in the controllers.
      req[target] = schema.parse(req[target]);

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // 2. Structured Error Response
        return res.status(400).json({
          message: err.issues[0]?.message || "Validation failed", // Friendly top-level message
          errors: err.flatten().fieldErrors, // Cleaner structured errors for the frontend
        });
      }

      // 3. Fallback for unexpected errors
      return res.status(500).json({
        message: "Internal server error during validation",
      });
    }
  };

export default validate;
