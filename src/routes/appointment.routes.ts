import { Router } from "express";
import {
  bookAppointment,
  getAppointments,
  getTodaysAppointments,
  updateAppointmentStatus,
  updateAvailability,
  scheduleAppointment,
  selectAppointmentOption,
  cancelProposalGroup,
  getWeeklyHours,
  setWeeklyHours,
} from "../controllers/appointment.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Students
router.post("/",                            authorizeRole("STUDENT"),   bookAppointment);
router.get("/",                                                          getAppointments);
router.post("/:id/select",                  authorizeRole("STUDENT"),   selectAppointmentOption);

// Counselors
router.get("/today",                        authorizeRole("COUNSELOR"), getTodaysAppointments);
router.patch("/:id/status",                 authorizeRole("COUNSELOR"), updateAppointmentStatus);
router.patch("/availability",               authorizeRole("COUNSELOR"), updateAvailability);
router.get("/availability/hours",           authorizeRole("COUNSELOR"), getWeeklyHours);
router.put("/availability/hours",           authorizeRole("COUNSELOR"), setWeeklyHours);
router.post("/schedule",                    authorizeRole("COUNSELOR"), scheduleAppointment);
router.patch("/group/:groupId/cancel",      authorizeRole("COUNSELOR"), cancelProposalGroup);

export default router;
