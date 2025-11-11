import { Router } from "express";

import { schoolSignup, verifyEmail } from "../../controllers/auth.controller";
import { adminLoginStep1 } from "../../controllers/loginAdmin.controller";
import { adminLoginStep2 } from "../../controllers/verifyAdminOtp.controller";

const router = Router();

router.post("/signup", schoolSignup);
router.get("/verify-email", verifyEmail);
router.post("/admin/login", adminLoginStep1);
router.post("/admin/login/verify", adminLoginStep2);



export default router;
