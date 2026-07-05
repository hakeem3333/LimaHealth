import { Router } from "express";
import {
  bookAppointment,
  getAppointments,
  getTodaysAppointments,
  updateAppointmentStatus,
  updateAvailability,
} from "../controllers/appointment.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Students
router.post("/",                            authorizeRole("STUDENT"),   bookAppointment);
router.get("/",                                                          getAppointments);

// Counselors
router.get("/today",                        authorizeRole("COUNSELOR"), getTodaysAppointments);
router.patch("/:id/status",                 authorizeRole("COUNSELOR"), updateAppointmentStatus);
router.patch("/availability",               authorizeRole("COUNSELOR"), updateAvailability);

export default router;
