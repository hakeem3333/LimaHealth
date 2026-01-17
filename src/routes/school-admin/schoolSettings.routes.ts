// routes/schoolSettings.routes.ts
import { Router } from "express";
import {
  getSchoolSettings,
  updateSchoolSettings,
} from "../../controllers/school-admin/schoolSettings.controller";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/settings",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getSchoolSettings
);

router.put(
  "/settings",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  updateSchoolSettings
);

export default router;
