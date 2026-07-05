// routes/admin.routes.ts
import { Router } from "express";
import { changeAdminPassword } from "../../controllers/org-admin/admin.controller";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";

const router = Router();

router.put(
  "/change-password",
  authenticate,
  authorizeRole("SUPER_ADMIN", "ORG_ADMIN"),
  changeAdminPassword
);

export default router;
