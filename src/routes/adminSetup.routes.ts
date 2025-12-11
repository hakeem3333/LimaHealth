import express from "express";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";
import {
  addCounsellor,
  addTeacher,
  addStudent,
} from "../controllers/admin/setupAdmin.controller";

const router = express.Router();

router.post(
  "/counsellors",
  authenticate,
  authorizeRole("ADMIN"),
  addCounsellor
);
router.post("/teachers", authenticate, authorizeRole("ADMIN"), addTeacher);
router.post("/students", authenticate, authorizeRole("ADMIN"), addStudent);

export default router;
