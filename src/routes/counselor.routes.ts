import { Router } from "express";
import {
  getCounselorDashboard,
  getStudentsAtRisk,
  getStudentDetails,
} from "../controllers/counselor.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.use(authorizeRole("COUNSELOR"));

router.get("/dashboard",       getCounselorDashboard);
router.get("/students",        getStudentsAtRisk);
router.get("/students/:id",    getStudentDetails);

export default router;
