import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import {
  listSchoolAdmins,
  resetAdminPassword,
  deactivateAdmin,
} from "../../controllers/super-admin/superAdminAdmins.controller";

import { getAuditLogs } from "../../super-admin/controllers/auditLogs.controller";
import { getSuperAdminDashboard } from "../../super-super-admin/controllers/superAdminDashboard.controller";
import { getSuperAdminReports } from "../../super-admin/controllers/superAdminReports.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));

router.get("/admins", listSchoolAdmins);
router.post("/admins/:id/reset-password", resetAdminPassword);
router.patch("/admins/:id/deactivate", deactivateAdmin);

router.get("/audit-logs", getAuditLogs);

router.get("/dashboard", getSuperAdminDashboard);

router.get("/reports", getSuperAdminReports);

export default router;
