import { Router } from "express";
import {
  createAlert,
  getAllAlerts,
  getAlertById,
  resolveAlert,
  updateAlert,
  deleteAlert,
} from "../controllers/alert.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", authorizeRole("COUNSELOR", "STUDENT"), getAllAlerts);
router.get("/:id", authorizeRole("COUNSELOR", "STUDENT"), getAlertById);
router.post("/", authorizeRole("COUNSELOR"), createAlert);
router.patch("/:id/resolve", authorizeRole("COUNSELOR", "STUDENT"), resolveAlert);
router.put("/:id", authorizeRole("COUNSELOR"), updateAlert);
router.delete("/:id", authorizeRole("COUNSELOR"), deleteAlert);

export default router;
