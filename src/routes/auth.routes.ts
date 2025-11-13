import { Router } from "express";

import { schoolSignup, verifyEmail } from "../controllers/admin/auth.controller";
import { adminLoginStep1 } from "../controllers/admin/loginAdmin.controller";
import { adminLoginStep2 } from "../controllers/admin/verifyAdminOtp.controller";

// import { authenticate, authorize } from "../../middleware/auth.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  uploadCSV,
  bulkUploadUsers,
} from "../controllers/admin/bulkUpload.controller";

const router = Router();

// POST /api/v1/admin/upload (file: CSV)
router.post(
  "/upload",
  authenticate,
  authorize("ADMIN"),
  uploadCSV,
  bulkUploadUsers
);

router.post("/signup", schoolSignup);
router.get("/verify-email", verifyEmail);
router.post("/admin/login", adminLoginStep1);
router.post("/admin/verify-otp", adminLoginStep2);



export default router;
