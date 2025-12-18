import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getSchoolStudents } from "../../controllers/school-admin/students.controller";

const router = Router();

router.get(
  "/students",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getSchoolStudents
);

export default router;
