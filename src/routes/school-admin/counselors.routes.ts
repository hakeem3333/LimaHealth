import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { listCounselors } from "../../controllers/school-admin/counselors.controller";

const router = Router();

router.get(
  "/counselors",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  listCounselors
);

export default router;
