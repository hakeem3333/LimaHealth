import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { getSchoolWearables } from "../../controllers/school-admin/schoolWearables.controller";

const router = Router();

router.get(
  "/wearables",
  authenticate,
  authorize("SCHOOL_ADMIN"),
  getSchoolWearables
);

export default router;
