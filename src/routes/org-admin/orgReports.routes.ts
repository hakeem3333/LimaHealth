// routes/orgReports.routes.ts
import { Router } from "express";
import { getOrgReports } from "../../controllers/org-admin/orgReports.controller";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/reports",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getOrgReports
);

export default router;
