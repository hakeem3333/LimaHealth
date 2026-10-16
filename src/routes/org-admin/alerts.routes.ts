import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { listSchoolAlerts, getSchoolAlertById, updateSchoolAlertStatus } from "../../controllers/org-admin/alerts.controller";

const router = Router();

// GET /org/alerts?severity=HIGH&status=OPEN
router.get(
  "/alerts",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  listSchoolAlerts
);

// GET /org/alerts/:id
router.get(
  "/alerts/:id",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getSchoolAlertById
);

// PATCH /org/alerts/:id  { status: "OPEN" | "RESOLVED" }
router.patch(
  "/alerts/:id",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  updateSchoolAlertStatus
);

export default router;
