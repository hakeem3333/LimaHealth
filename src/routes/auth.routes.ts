import { Router } from "express";
import { schoolSignup, verifyEmail } from "../controllers/auth.controller";

const router = Router();

router.post("/signup", schoolSignup);
router.get("/verify-email", verifyEmail);



export default router;
