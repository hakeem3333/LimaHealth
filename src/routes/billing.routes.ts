import express, { Router } from "express";
import {
  createSubscriptionSession,
  stripeWebhook,
  getSubscriptionStatus,
} from "../controllers/billing.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";


const router = Router();

router.post(
  "/initialize",
  authenticate,
  authorize("ADMIN"),
  createSubscriptionSession
);

router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // Needed for Stripe
  stripeWebhook
);

router.get(
  "/status/:schoolId",
  authenticate,
  authorize("admin", "counselor"),
  getSubscriptionStatus
);

export default router;
