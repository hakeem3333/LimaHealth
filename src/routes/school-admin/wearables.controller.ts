import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getSchoolWearables } from "../../controllers/school-admin/schoolWearables.controller";

const router = Router();

router.get(
  "/wearables",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getSchoolWearables
);

export default router;
