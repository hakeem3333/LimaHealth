import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { listSchoolAlerts } from "../../controllers/org-admin/alerts.controller";

const router = Router();

// GET /school/alerts?severity=HIGH&status=OPEN
router.get(
  "/alerts",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  listSchoolAlerts
);

export default router;
