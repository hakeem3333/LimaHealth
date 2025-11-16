// src/routes/fitbit.routes.ts

import { Router } from "express";
// Fix: Ensure correct import of Request and Response types
import type { Request, Response } from "express";
// Import controller functions instead of service functions
import {
  authorizeFitbit,
  handleFitbitCallback,
  syncFitbitData,
} from "../controllers/fitbit.controller";

// Create a new router instance
const router = Router();

/**
 * Middleware to ensure user is authenticated (required for linking)
 * NOTE: This is placeholder middleware assuming 'req.session.userId' is set
 * by your application's session management.
 */
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  // This is a placeholder for your actual authentication check
  if (!(req as any).session?.userId) {
    // In a real app, this should redirect or return a 401
    return res
      .status(401)
      .send({ error: "Authentication required to link Fitbit." });
  }
  next();
};

// Route 1: Initiates the Fitbit OAuth flow
// GET /fitbit/auth
router.get("/auth", ensureAuthenticated, authorizeFitbit);

// Route 2: Handles the callback after successful Fitbit authorization
// GET /fitbit/callback
router.get("/callback", handleFitbitCallback);

// Route 3: Manually triggers data fetch and save (including token refresh logic)
// POST /fitbit/sync
router.post("/sync", ensureAuthenticated, syncFitbitData);

export default router;
