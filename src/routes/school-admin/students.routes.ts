import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getSchoolStudents } from "../../controllers/school-admin/students.controller";
import { getStudentProfile } from "../../controllers/school-admin/student-profile.controller";

const router = Router();

router.get(
  "/students",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getSchoolStudents
);

router.get(
  "/students/:studentId",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getStudentProfile
);

export default router;
