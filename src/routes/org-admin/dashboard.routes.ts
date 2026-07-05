import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getOrgDashboard } from "../../controllers/org-admin/dashboard.controller";

const router = Router();

router.get(
  "/dashboard",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getOrgDashboard
);

export default router;
