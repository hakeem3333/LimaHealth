import { Router } from "express";
import { authenticateSuperAdmin, authorizeRole } from "../../middleware/auth.middleware";
import { authLimiter, otpLimiter } from "../../middleware/rateLimit.middleware";
import {
  listOrgAdmins,
  resetAdminPassword,
  deactivateAdmin,
} from "../../controllers/super-admin/superAdminAdmins.controller";

import { getAuditLogs } from "../../controllers/super-admin/auditLogs.controller";
import { getSuperAdminDashboard } from "../../controllers/super-admin/superAdminDashboard.controller";
import { getSuperAdminReports } from "../../controllers/super-admin/superAdminReports.controller";
import {
  getAllOrgs,
  getOrgById,
  updateOrganisation,
} from "../../controllers/super-admin/superAdminOrganisations.controller";

import {
  getOrgAdmins,
  assignAdminToOrg,
  removeAdminFromOrg,
} from "../../controllers/super-admin/superAdminOrgAdmins.controller";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../../controllers/super-admin/superAdminSettings.controller";

import {
  superAdminRefreshToken,
} from "../../controllers/super-admin/superAdminRefreshToken.controller"; 
import { superAdminLoginStep1,
  superAdminVerifyOtp,
  superAdminLogout, } from "../../controllers/super-admin/auth.controller";

const router = Router();

/* -----------------------------
   Public / Auth Routes
   (No middleware here)
------------------------------ */
router.post("/login", authLimiter, superAdminLoginStep1);
router.post("/verify-otp", otpLimiter, superAdminVerifyOtp);
router.post("/logout", superAdminLogout);
router.post("/refresh-token", superAdminRefreshToken);

/* -----------------------------
Protected Routes 
(Middleware applies to everything below)
------------------------------ */

router.use(authenticateSuperAdmin);
router.use(authorizeRole("SUPER_ADMIN"));

router.get("/admins", listOrgAdmins);
router.post("/admins/:id/reset-password", resetAdminPassword);
router.patch("/admins/:id/deactivate", deactivateAdmin);

router.get("/audit-logs", getAuditLogs);

router.get("/dashboard", getSuperAdminDashboard);

router.get("/reports", getSuperAdminReports);

router.get("/organisations", getAllOrgs);
router.get("/organisations/:orgId", getOrgById);
router.put("/organisations/:orgId", updateOrganisation);

router.get("/organisations/:orgId/admins", getOrgAdmins);

router.post("/organisations/:orgId/admins", assignAdminToOrg);

router.delete("/organisations/:orgId/admins/:adminId", removeAdminFromOrg);


router.get("/settings", getPlatformSettings);
router.put("/settings", updatePlatformSettings);

export default router;
