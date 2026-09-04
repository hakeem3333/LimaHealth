import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import {
  listCounselors,
  getCounselorProfile,
  assignStudentsToCounselor,
  setCounselorActive,
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

router.post(
  "/counselors/:counselorId/assign",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  assignStudentsToCounselor
);

router.patch(
  "/counselors/:counselorId/status",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  setCounselorActive
);

export default router;
