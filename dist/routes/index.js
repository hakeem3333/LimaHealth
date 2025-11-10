import { Router } from "express";
import schoolRoutes from "./school.routes";
import subscriptionRoutes from "./subscription.routes";
import roleRoutes from "./role.routes";
import userRoutes from "./user.routes";
import biometricLogRoutes from "./biometricLog.routes";
import moodLogRoutes from "./moodLog.routes";
import alertRoutes from "./alert.routes";
import parentStudentRelationshipRoutes from "./parentStudentRelationship.routes";
import consentRoutes from "./consent.routes";
// import fitbitRoutes from "./fitbit.routes";
const router = Router();
// Define all top-level API routes
router.use("/schools", schoolRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/roles", roleRoutes);
router.use("/users", userRoutes);
router.use("/biometric-logs", biometricLogRoutes);
router.use("/mood-logs", moodLogRoutes);
router.use("/alerts", alertRoutes);
router.use("/parent-student-relationships", parentStudentRelationshipRoutes);
router.use("/consents", consentRoutes);
// router.use("/fitbit", fitbitRoutes);
export default router;
//# sourceMappingURL=index.js.map