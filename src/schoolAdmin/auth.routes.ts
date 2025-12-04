import { Router } from "express";

import { schoolSignup, verifyEmail } from "../auth/admin/auth.controller";
import { adminLoginStep1 } from "../auth/admin/loginAdmin.controller";
import { adminLoginStep2 } from "../auth/admin/verifyAdminOtp.controller";

import { login, logout } from "../auth/user/auth/login.controller.js";
import { forgotPassword } from "../auth/user/auth/forget-password.controller.js";

// import { authenticate, authorize } from "../../middleware/auth.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  uploadCSV,
  bulkUploadUsers,
} from "../auth/admin/bulkUpload.controller";

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

router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);

export default router;
