// routes/schoolReports.routes.ts
import { Router } from "express";
import { getSchoolReports } from "../../controllers/school-admin/schoolReports.controller";
import { authenticate, authorize } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/reports",
  authenticate,
  authorize("SCHOOL_ADMIN"),
  getSchoolReports
);

export default router;
