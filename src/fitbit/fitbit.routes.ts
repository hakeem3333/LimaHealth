// src/routes/fitbit.routes.ts

import { Router } from "express";
import {
  authorizeFitbit,
  handleFitbitCallback,
  syncFitbitData,
} from "../controllers/fitbit.controller";

// 🔐 JWT auth middleware
import { authenticate } from "../middleware/auth.middleware";
// (adjust path if your file name differs)

const router = Router();

/**
 * Fitbit OAuth Routes (Protected with JWT except callback)
 */

// Initiates Fitbit OAuth flow
// GET /fitbit/auth
router.get("/auth", authenticate, authorizeFitbit);

// Fitbit redirects back to this URL
// GET /fitbit/callback
// NOTE: Does not require JWT because Fitbit sends the user back with ?code=...
//       BUT you *can* protect it with JWT if this URL is hit from your app only.
router.get("/callback", authenticate, handleFitbitCallback);

// Sync data (requires JWT + Fitbit must be linked)
// POST /fitbit/sync
router.post("/sync", authenticate, syncFitbitData);

export default router;
