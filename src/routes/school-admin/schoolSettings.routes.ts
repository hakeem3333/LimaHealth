// routes/schoolSettings.routes.ts
import { Router } from "express";
import {
  getSchoolSettings,
  updateSchoolSettings,
} from "../../controllers/admin-school/schoolSettings.controller";
import { authenticate, authorize } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/settings",
  authenticate,
  authorize("SCHOOL_ADMIN"),
  getSchoolSettings
);

router.put(
  "/settings",
  authenticate,
  authorize("SCHOOL_ADMIN"),
  updateSchoolSettings
);

export default router;
