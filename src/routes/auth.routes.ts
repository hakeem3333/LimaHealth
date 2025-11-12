import { Router } from "express";

import { schoolSignup, verifyEmail } from "../controllers/admin/auth.controller";
import { adminLoginStep1 } from "../controllers/admin/loginAdmin.controller";
import { adminLoginStep2 } from "../controllers/admin/verifyAdminOtp.controller";

const router = Router();

router.post("/signup", schoolSignup);
router.get("/verify-email", verifyEmail);
router.post("/admin/login", adminLoginStep1);
router.post("/admin/verify-otp", adminLoginStep2);



export default router;
