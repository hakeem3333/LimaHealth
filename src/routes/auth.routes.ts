import { Router } from "express";
import { schoolSignup, verifyEmail, adminLogout, getMe } from "../controllers/admin/auth.controller.js";
import { handleRefreshToken } from "../controllers/refreshToken.controller.js";
import { adminLoginStep1 } from "../controllers/admin/loginAdmin.controller.js";
import { adminLoginStep2 } from "../controllers/admin/verifyAdminOtp.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";
import { uploadFile, bulkUploadUsers, getFailedCSV } from "../controllers/admin/bulkUpload.controller.js";
import { login, loginSchema } from "../controllers/user/auth/login.controller.js";
import validate from "../middleware/validate.middleware.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimit.middleware.js";
import { forgotPassword, resetPassword } from "../controllers/passwordReset.controller.js";

const router = Router();

// User login (students, counselors, parents)
router.post("/login", authLimiter, validate(loginSchema), login);

// School admin signup & email verification
router.post("/admin/signup",       authLimiter, schoolSignup);
router.get("/admin/verify-email",               verifyEmail);

// School admin 2FA login
router.post("/admin/login",       authLimiter, adminLoginStep1);
router.post("/admin/verify-otp",  otpLimiter,  adminLoginStep2);

// Password reset (public — no auth required)
router.post("/forgot-password",   authLimiter, forgotPassword);
router.post("/reset-password",                 resetPassword);

// Session management
router.post("/logout",        adminLogout);
router.post("/refresh-token", handleRefreshToken);

// Authenticated routes
router.get("/me", authenticate, authorizeRole("ORG_ADMIN"), getMe);

router.post(
  "/upload",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  uploadFile,
  bulkUploadUsers,
);

router.get(
  "/setup/bulk-upload/failed-csv/:logId",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getFailedCSV,
);

export default router;
