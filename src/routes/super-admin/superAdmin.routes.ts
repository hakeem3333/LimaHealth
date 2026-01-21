import { Router } from "express";
import { authenticateSuperAdmin, authorizeRole } from "../../middleware/auth.middleware";
import {
  listSchoolAdmins,
  resetAdminPassword,
  deactivateAdmin,
} from "../../controllers/super-admin/superAdminAdmins.controller";

import { getAuditLogs } from "../../controllers/super-admin/auditLogs.controller";
import { getSuperAdminDashboard } from "../../controllers/super-admin/superAdminDashboard.controller";
import { getSuperAdminReports } from "../../controllers/super-admin/superAdminReports.controller";
import {
  getAllSchools,
  getSchoolById,
  updateSchool,
} from "../../controllers/super-admin/superAdminSchools.controller";

import {
  getSchoolAdmins,
  assignAdminToSchool,
  removeAdminFromSchool,
} from "../../controllers/super-admin/superAdminSchoolAdmins.controller";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../../controllers/super-admin/superAdminSettings.controller";

import {
  superAdminRefreshToken,
} from "../../controllers/super-admin/superAdminRefreshToken.controller"; 
import { superAdminLoginStep1,
  superAdminVerifyOtp,  } from "../../controllers/super-admin/auth.controller";

const router = Router();

/* -----------------------------
   Public / Auth Routes 
   (No middleware here)
------------------------------ */
router.post("/login", superAdminLoginStep1);
router.post("/verify-otp", superAdminVerifyOtp); // This uses the temp cookie, not the access_token
router.post("/refresh-token", superAdminRefreshToken);

/* -----------------------------
Protected Routes 
(Middleware applies to everything below)
------------------------------ */

router.use(authenticateSuperAdmin);
router.use(authorizeRole("SUPER_ADMIN"));

router.get("/admins", listSchoolAdmins);
router.post("/admins/:id/reset-password", resetAdminPassword);
router.patch("/admins/:id/deactivate", deactivateAdmin);

router.get("/audit-logs", getAuditLogs);

router.get("/dashboard", getSuperAdminDashboard);

router.get("/reports", getSuperAdminReports);

router.get("/schools", getAllSchools);
router.get("/schools/:schoolId", getSchoolById);
router.put("/schools/:schoolId", updateSchool);

router.get("/schools/:schoolId/admins", getSchoolAdmins);

router.post("/schools/:schoolId/admins", assignAdminToSchool);

router.delete("/schools/:schoolId/admins/:adminId", removeAdminFromSchool);


router.get("/settings", getPlatformSettings);
router.put("/settings", updatePlatformSettings);

export default router;
