import { Router } from "express";
import {
  requestParentalConsent,
  viewParentalConsentRequest,
  submitParentalConsentDecision,
} from "../controllers/parentConsent.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

// Org-admin initiated, for a student in their own organisation
router.post("/request", authenticate, authorizeRole("ORG_ADMIN"), requestParentalConsent);

// Parent-facing — no account required, token is the credential
router.get("/:token", viewParentalConsentRequest);
router.post("/:token/decision", submitParentalConsentDecision);

export default router;
