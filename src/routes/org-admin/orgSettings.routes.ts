// routes/orgSettings.routes.ts
import { Router } from "express";
import {
  getOrgSettings,
  updateOrgSettings,
} from "../../controllers/org-admin/orgSettings.controller";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/settings",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getOrgSettings
);

router.put(
  "/settings",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  updateOrgSettings
);

export default router;
