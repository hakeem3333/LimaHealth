import { Router } from "express";
import {
  authorizeFitbit,
  handleFitbitCallback,
  syncFitbitData,
  getFitbitStatus,
  getFitbitData,
  disconnectFitbit,
} from "../controllers/fitbit.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// OAuth flow — no auth required (user is not yet logged in via Fitbit)
router.get("/auth",     authorizeFitbit);
router.get("/callback", handleFitbitCallback);

// Status check — public so the home screen can check before token is refreshed
router.get("/status/:userId", getFitbitStatus);
router.get("/data/:userId",   getFitbitData);

// Protected — require JWT
router.post("/sync",       authenticate, syncFitbitData);
router.delete("/disconnect", authenticate, disconnectFitbit);

export default router;
