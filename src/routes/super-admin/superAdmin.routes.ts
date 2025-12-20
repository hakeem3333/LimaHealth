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
import {
  getAllSchools,
  getSchoolById,
  updateSchool,
} from "../../super-admin/controllers/superAdminSchools.controller";

import {
  getSchoolAdmins,
  assignAdminToSchool,
  removeAdminFromSchool,
} from "../../super-admin/controllers/superAdminSchoolAdmins.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("SUPER_ADMIN"));

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

export default router;
