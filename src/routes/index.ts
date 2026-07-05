import { Router } from "express";
import organisationRoutes from "./organisation.routes.js";
import authRoutes from "./auth.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import roleRoutes from "./role.routes.js";
import userRoutes from "./user.routes.js";
import biometricLogRoutes from "./biometricLog.routes.js";
import moodLogRoutes from "./moodLog.routes.js";
import alertRoutes from "./alert.routes.js";
import parentStudentRelationshipRoutes from "./parentStudentRelationship.routes.js";
import consentRoutes from "./consent.routes.js";
import fitbitRoutes from "./fitbit.routes.js";
import counselorRoutes from "./counselor.routes.js";
import adminSetupRoutes from "./adminSetup.routes.js";
import billingRoutes from "./billing.routes.js";
import orgAdminDashboardRoutes from "./org-admin/dashboard.routes.js";
import orgAdminMemberRoutes from "./org-admin/members.routes.js";
import orgAdminCounselorRoutes from "./org-admin/counselors.routes.js";
import orgAdminAlertRoutes from "./org-admin/alerts.routes.js";
import orgAdminProfileRoutes from "./org-admin/admin.routes.js";
import orgReportsRoutes from "./org-admin/orgReports.routes.js";
import orgAdminSettingsRoutes from "./org-admin/orgSettings.routes.js";
import orgAdminWearablesRoutes from "./org-admin/orgWearables.routes.js";
import downloadCSV from "./org-admin/downloadCSV.js";
import superAdminRoutes from "./super-admin/superAdmin.routes.js";
import aiRoutes from "./ai.routes.js";
import appointmentRoutes from "./appointment.routes.js";

const router = Router();

// Organisations (public: registration, activation)
router.use("/organisations", organisationRoutes);

// Auth
router.use("/auth", authRoutes);

// Org Admin routes (previously /school/...)
router.use("/org", orgAdminDashboardRoutes);
router.use("/org", orgAdminMemberRoutes);
router.use("/org", orgAdminCounselorRoutes);
router.use("/org", orgAdminAlertRoutes);
router.use("/org", orgAdminProfileRoutes);
router.use("/org", orgReportsRoutes);
router.use("/org", orgAdminSettingsRoutes);
router.use("/org", orgAdminWearablesRoutes);
router.use("/admin/setup/bulk-upload", downloadCSV);

// Super Admin
router.use("/super-admin", superAdminRoutes);

// Member-facing routes
router.use("/subscriptions", subscriptionRoutes);
router.use("/roles", roleRoutes);
router.use("/users", userRoutes);
router.use("/counselor", counselorRoutes);
router.use("/biometric-logs", biometricLogRoutes);
router.use("/mood-logs", moodLogRoutes);
router.use("/alerts", alertRoutes);
router.use("/parent-relationships", parentStudentRelationshipRoutes);
router.use("/consents", consentRoutes);
router.use("/fitbit", fitbitRoutes);
router.use("/admin/setup", adminSetupRoutes);
router.use("/billing", billingRoutes);
router.use("/ai", aiRoutes);
router.use("/appointments", appointmentRoutes);

export default router;
