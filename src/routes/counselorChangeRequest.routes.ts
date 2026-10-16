import { Router } from "express";
import {
  createCounselorChangeRequest,
  getMyCounselorChangeRequests,
  listCounselorChangeRequests,
  resolveCounselorChangeRequest,
} from "../controllers/counselorChangeRequest.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Student-facing
router.post("/", createCounselorChangeRequest);
router.get("/me", getMyCounselorChangeRequests);

// Org-admin review queue
router.get("/", authorizeRole("ORG_ADMIN"), listCounselorChangeRequests);
router.patch("/:id/resolve", authorizeRole("ORG_ADMIN"), resolveCounselorChangeRequest);

export default router;
