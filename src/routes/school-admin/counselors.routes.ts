import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import {
  listCounselors,
  getCounselorProfile,
} from "../../controllers/school-admin/counselors.controller";

const router = Router();

router.get(
  "/counselors",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  listCounselors
);

// Get single counselor profile
router.get(
    "/counselors/:counselorId", 
    authenticate, 
    authorizeRole("SCHOOL_ADMIN"), 
    getCounselorProfile);

export default router;
