import { Router } from "express";
import {
  getStudentsAtRisk,
  getStudentDetails,
} from "../controllers/counselor.controller";
import { authorizeRole } from "../middleware/auth.middleware";

const router = Router();

// only counselors can access these
router.get("/students", authorizeRole("counselor"), getStudentsAtRisk);
router.get("/students/:id", authorizeRole("counselor"), getStudentDetails);

export default router;
