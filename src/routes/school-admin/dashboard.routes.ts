import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getSchoolDashboard } from "../../controllers/school-admin/dashboard.controller";

const router = Router();

router.get(
  "/dashboard",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getSchoolDashboard
);

export default router;
