import express from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  addCounsellor,
  addTeacher,
  addStudent,
} from "../auth/admin/setupAdmin.controller";

const router = express.Router();

// All routes require ADMIN auth
router.post("/counsellors", authenticate, authorize("ADMIN"), addCounsellor);
router.post("/teachers", authenticate, authorize("ADMIN"), addTeacher);
router.post("/students", authenticate, authorize("ADMIN"), addStudent);

export default router;
