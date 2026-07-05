import { Router } from "express";
import { analyzeHealth } from "../controllers/ai.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/analyze", analyzeHealth);

export default router;
