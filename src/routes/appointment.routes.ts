import { Router } from "express";
import {
  bookAppointment,
  getAvailableSlots,
  cancelMyAppointment,
  getAppointments,
  getTodaysAppointments,
  updateAppointmentStatus,
  updateAvailability,
  scheduleAppointment,
  selectAppointmentOption,
  cancelProposalGroup,
  getWeeklyHours,
  setWeeklyHours,
  getTimeOff,
  addTimeOff,
  deleteTimeOff,
} from "../controllers/appointment.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Students
router.post("/",                            authorizeRole("STUDENT"),   bookAppointment);
router.get("/",                                                          getAppointments);
router.get("/slots",                        authorizeRole("STUDENT"),   getAvailableSlots);
router.post("/:id/select",                  authorizeRole("STUDENT"),   selectAppointmentOption);
router.patch("/:id/cancel",                 authorizeRole("STUDENT"),   cancelMyAppointment);

// Counselors
router.get("/today",                        authorizeRole("COUNSELOR"), getTodaysAppointments);
router.patch("/:id/status",                 authorizeRole("COUNSELOR"), updateAppointmentStatus);
router.patch("/availability",               authorizeRole("COUNSELOR"), updateAvailability);
router.get("/availability/hours",           authorizeRole("COUNSELOR"), getWeeklyHours);
router.put("/availability/hours",           authorizeRole("COUNSELOR"), setWeeklyHours);
router.get("/availability/time-off",        authorizeRole("COUNSELOR"), getTimeOff);
router.post("/availability/time-off",       authorizeRole("COUNSELOR"), addTimeOff);
router.delete("/availability/time-off/:id", authorizeRole("COUNSELOR"), deleteTimeOff);
router.post("/schedule",                    authorizeRole("COUNSELOR"), scheduleAppointment);
router.patch("/group/:groupId/cancel",      authorizeRole("COUNSELOR"), cancelProposalGroup);

export default router;
