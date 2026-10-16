import { Router } from "express";
import { schoolSignup, verifyEmail, adminLogout, getMe } from "../controllers/admin/auth.controller.js";
import { handleRefreshToken } from "../controllers/refreshToken.controller.js";
import { adminLoginStep1, adminResendOtp, getOrgTypeByEmail } from "../controllers/admin/loginAdmin.controller.js";
import { adminLoginStep2 } from "../controllers/admin/verifyAdminOtp.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";
import { uploadFile, bulkUploadUsers, getFailedCSV, downloadEnrollmentTemplate } from "../controllers/admin/bulkUpload.controller.js";
import { login, loginSchema } from "../controllers/user/auth/login.controller.js";
import { changePassword } from "../controllers/user/auth/changePassword.controller.js";
import { requestParentLoginOtp, verifyParentLoginOtp } from "../controllers/user/auth/parentOtpLogin.controller.js";
import validate from "../middleware/validate.middleware.js";
import { limiters } from "../middleware/rateLimit.middleware.js";
import { forgotPassword, resetPassword } from "../controllers/passwordReset.controller.js";

const router = Router();

// User login (students, counselors)
router.post("/login", limiters.userLogin, validate(loginSchema), login);

// Parent login — passwordless, email one-time code
router.post("/parent/login",        limiters.parentCode, requestParentLoginOtp);
router.post("/parent/login/verify", limiters.parentOtp, verifyParentLoginOtp);

// School admin signup & email verification
router.post("/admin/signup",       limiters.signup, schoolSignup);
router.get("/admin/verify-email",               verifyEmail);

// School admin 2FA login
router.post("/admin/login",       limiters.adminLogin, adminLoginStep1);
router.post("/admin/verify-otp",  limiters.adminOtp, adminLoginStep2);
router.post("/admin/resend-otp",  limiters.adminResend, adminResendOtp);

// Org type lookup for login-page theming (rate-limited — reveals org type only, not account existence)
router.get("/admin/org-type",     limiters.orgLookup, getOrgTypeByEmail);

// Password reset (public — no auth required)
router.post("/forgot-password",   limiters.forgotPassword, forgotPassword);
router.post("/reset-password",                 resetPassword);

// Session management
router.post("/logout",        adminLogout);
router.post("/refresh-token", handleRefreshToken);

// Authenticated routes
router.get("/me", authenticate, authorizeRole("ORG_ADMIN"), getMe);

router.post(
  "/change-password",
  authenticate,
  authorizeRole("STUDENT", "COUNSELOR"),
  changePassword,
);

router.post(
  "/upload",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  uploadFile,
  bulkUploadUsers,
);

router.get(
  "/upload/template",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  downloadEnrollmentTemplate,
);

router.get(
  "/setup/bulk-upload/failed-csv/:logId",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getFailedCSV,
);

export default router;
