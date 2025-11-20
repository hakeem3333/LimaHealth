import { Router } from "express";
import {
  createSubscriptionSession,
  paystackWebhook,
  getSubscriptionStatus,
} from "../controllers/billing.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/initialize",
  authenticate,
  authorize("admin"), // ONLY school admins can purchase plans
  createSubscriptionSession
);

// webhook - no auth required
router.post("/webhook", paystackWebhook);

router.get(
  "/status/:schoolId",
  authenticate,
  authorize("admin", "counselor"),
  getSubscriptionStatus
);

export default router;
