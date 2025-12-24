// routes/admin.routes.ts
import { Router } from "express";
import { changeAdminPassword } from "../../controllers/school-admin/admin.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

router.put(
  "/change-password",
  authenticate,
  authorize("SUPER_ADMIN", "SCHOOL_ADMIN"),
  changeAdminPassword
);

export default router;
