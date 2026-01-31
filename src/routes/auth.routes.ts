import { Router } from "express";

import { schoolSignup, verifyEmail } from "../controllers/admin/auth.controller";
import { adminLoginStep1 } from "../controllers/admin/loginAdmin.controller";
import { adminLoginStep2 } from "../controllers/admin/verifyAdminOtp.controller";

// import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";
import {
  uploadFile,
  bulkUploadUsers,
  getFailedCSV,
} from "../controllers/admin/bulkUpload.controller";

import { login, loginSchema } from "../controllers/user/auth/login.controller";
import validate from "../middleware/validate.middleware";
import { getMe } from "../controllers/admin/auth.controller.js";

const router = Router();

router.post("/login", validate(loginSchema), login);


// POST /api/v1/admin/upload (file: CSV)
router.post(
  "/upload",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  uploadFile,
  bulkUploadUsers,
);

router.get(
  "/setup/bulk-upload/failed-csv/:logId",
  authenticate,
  authorizeRole("SCHOOL_ADMIN"),
  getFailedCSV,
);

router.post("/admin/signup", schoolSignup);
router.get("/admin/verify-email", verifyEmail);
router.post("/admin/login", adminLoginStep1);
router.post("/admin/verify-otp", adminLoginStep2);

router.get("/me",
   authenticate,
  authorizeRole("SCHOOL_ADMIN"), 
  getMe);

export default router;
