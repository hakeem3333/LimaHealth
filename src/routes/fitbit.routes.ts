import { Router } from "express";
import {
  getFitbitAuthUrl,
  handleFitbitCallback,
  syncFitbitData,
  getFitbitStatus,
  getFitbitData,
  disconnectFitbit,
} from "../controllers/fitbit.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// OAuth flow — the app fetches a consent URL (carrying a signed, single-use
// state), and Fitbit calls /callback, which trusts only that state.
router.get("/auth-url", authenticate, getFitbitAuthUrl);
router.get("/callback", handleFitbitCallback);

// Protected — require JWT; users can only access their own data
router.get("/status/:userId", authenticate, getFitbitStatus);
router.get("/data/:userId",   authenticate, getFitbitData);
router.post("/sync",          authenticate, syncFitbitData);
router.delete("/disconnect",  authenticate, disconnectFitbit);

export default router;
