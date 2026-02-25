import { Router } from "express";
import schoolRoutes from "./school.routes.js";
import authRoutes from "./auth.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import roleRoutes from "./role.routes.js";
import userRoutes from "./user.routes.js";
import biometricLogRoutes from "./biometricLog.routes.js";
import moodLogRoutes from "./moodLog.routes.js";
import alertRoutes from "./alert.routes.js";
import parentStudentRelationshipRoutes from "./parentStudentRelationship.routes.js";
import consentRoutes from "./consent.routes.js";
import fitbitRoutes from './fitbit.routes.js'; //
import counselorRoutes from "./counselor.routes.js";
import adminSetupRoutes from "./adminSetup.routes.js";
import billingRoutes from "./billing.routes.js";
import schoolAdminDashboardRoutes from "./school-admin/dashboard.routes.js";
import schoolAdminStudentRoutes from "./school-admin/students.routes.js";
import schoolAdminCounselorRoutes from "./school-admin/counselors.routes.js";
import schoolAdminAlertRoutes from "./school-admin/alerts.routes.js";
import schoolAdminProfileRoutes from "./school-admin/admin.routes.js";
import schoolReportsRoutes from "./school-admin/schoolReports.routes.js";
import schoolAdminSettingsRoutes from "./school-admin/schoolSettings.routes.js";
import schoolAdminWearablesRoutes from "./school-admin/wearables.controller.js";
import downloadCSV from "./school-admin/downloadCSV.js";
import superAdminRoutes from "./super-admin/superAdmin.routes.js";
import aiRoutes from "./ai.routes.js";
import appointmentRoutes from "./appointment.routes.js";


const router = Router();

// Define all top-level API routes
router.use("/schools", schoolRoutes);
router.use("/auth", authRoutes);
router.use("/school", schoolAdminDashboardRoutes);
router.use("/school", schoolAdminStudentRoutes);
router.use("/school", schoolAdminCounselorRoutes);
router.use("/school", schoolAdminAlertRoutes);
router.use("/school", schoolAdminProfileRoutes);
router.use("/school", schoolReportsRoutes);
router.use("/school", schoolAdminSettingsRoutes);
router.use("/school", schoolAdminWearablesRoutes);
router.use("/admin/setup/bulk-upload", downloadCSV);
router.use("/super-admin", superAdminRoutes);

router.use("/subscriptions", subscriptionRoutes);
router.use("/roles", roleRoutes);
router.use("/users", userRoutes);
router.use("/counselor", counselorRoutes);
router.use("/biometric-logs", biometricLogRoutes);
router.use("/mood-logs", moodLogRoutes);
router.use("/alerts", alertRoutes);
router.use("/parent-student-relationships", parentStudentRelationshipRoutes);
router.use("/consents", consentRoutes);
router.use("/fitbit", fitbitRoutes);
router.use("/admin/setup", adminSetupRoutes);
router.use("/billing", billingRoutes);

router.use("/ai", aiRoutes);
router.use("/appointments", appointmentRoutes);

export default router;
