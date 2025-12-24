import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { listSchoolAlerts } from "../../controllers/school-admin/alerts.controller";

const router = Router();

// GET /school/alerts?severity=HIGH&status=OPEN
router.get(
  "/alerts",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  listSchoolAlerts
);

export default router;
