import { Router } from "express";
import { analyzeHealth } from "../controllers/ai.controller.js";
// import { authenticate, authori... } // TODO: Add middleware later when refactored

const router = Router();

// POST /api/v1/ai/analyze
// TODO: Add auth middleware
router.post("/analyze", analyzeHealth);

export default router;
