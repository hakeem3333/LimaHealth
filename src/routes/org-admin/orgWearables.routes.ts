import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getOrgWearables } from "../../controllers/org-admin/orgWearables.controller";

const router = Router();

router.get(
  "/wearables",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getOrgWearables
);

export default router;
