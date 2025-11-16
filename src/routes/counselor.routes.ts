import { Router } from "express";
import {
  getStudentsAtRisk,
  getStudentDetails,
} from "../controllers/counselor.controller";
import { authorize } from "../middleware/auth.middleware";

const router = Router();

// only counselors can access these
router.get("/students", authorize("counselor"), getStudentsAtRisk);
router.get("/students/:id", authorize("counselor"), getStudentDetails);

export default router;
