import type { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";

const validate =
  (schema: ZodType<any>, target: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req[target] = schema.parse(req[target]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: err.issues[0]?.message || "Validation failed",
          errors: err.flatten().fieldErrors,
        });
      }

      return res.status(500).json({
        message: "Internal server error during validation",
      });
    }
  };

export default validate;
