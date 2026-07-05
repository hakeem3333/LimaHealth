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
  authorizeRole("ORG_ADMIN"),
  addCounsellor
);
router.post("/teachers", authenticate, authorizeRole("ORG_ADMIN"), addTeacher);
router.post("/students", authenticate, authorizeRole("ORG_ADMIN"), addStudent);
export default router;
