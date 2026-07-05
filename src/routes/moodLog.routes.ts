import { Router } from "express";
import {
  createMoodLog,
  getMyMoodLogs,
  getMoodLogById,
  updateMoodLog,
  deleteMoodLog,
} from "../controllers/moodLog.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

// ✅ User-specific routes
router.post("/", createMoodLog);
router.get("/", getMyMoodLogs);
router.get("/:id", getMoodLogById);
router.put("/:id", updateMoodLog);
router.delete("/:id", deleteMoodLog);

export default router;
