import { Router } from "express";
import {
  getStudentsAtRisk,
  getStudentDetails,
} from "../controllers/counselor.controller";
import { authorizeRoles } from "../middleware/auth";

const router = Router();

// only counselors can access these
router.get("/students", authorizeRoles("counselor"), getStudentsAtRisk);
router.get("/students/:id", authorizeRoles("counselor"), getStudentDetails);

export default router;
