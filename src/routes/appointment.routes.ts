import { Router } from "express";
import { bookAppointment, getAppointments, updateAppointmentStatus } from "../controllers/appointment.controller.js";

const router = Router();

// POST /api/v1/appointments
router.post("/", bookAppointment);

// GET /api/v1/appointments?userId=...&role=...
router.get("/", getAppointments);

// PATCH /api/v1/appointments/:id/status
router.patch("/:id/status", updateAppointmentStatus);

export default router;
