import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import {
  listCounselors,
  getCounselorProfile,
} from "../../controllers/org-admin/counselors.controller";

const router = Router();

router.get(
  "/counselors",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  listCounselors
);

// Get single counselor profile
router.get(
    "/counselors/:counselorId", 
    authenticate, 
    authorizeRole("ORG_ADMIN"), 
    getCounselorProfile);

export default router;
