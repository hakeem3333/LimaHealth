import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/**
 * Generic Zod validation middleware.
 *
 * Usage:
 *   router.post("/login", validate(loginSchema), login);
 */
const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse & validate body
      schema.parse(req.body);
      next();
    } catch (err: any) {
      if (err.errors) {
        // Zod validation error
        return res.status(400).json({
          message: "Validation failed",
          errors: err.errors.map((e: any) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      // Unknown error
      return res.status(400).json({
        message: "Invalid request data",
      });
    }
  };

export default validate;
