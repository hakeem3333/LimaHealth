import { Router } from "express";
import { schoolSignup } from "../controllers/auth.controller";

const router = Router();

router.post("/signup", schoolSignup);

export default router;
