import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";

// Instantiate status enums manually if not imported from client/index.d.ts yet
// In real app, import { AppointmentStatus } from "@prisma/client";
const AppointmentStatus = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
};

/**
 * Book an appointment (Student)
 */
export const bookAppointment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { studentId, counselorId, startTime, endTime, reason } = req.body;

        // Basic Validation
        if (!studentId || !counselorId || !startTime || !endTime) {
            res.status(400).json({ success: false, error: "Missing required fields" });
            return;
        }

        // Check availability (Mock: just check if counselor exists for now)
        const counselor = await prisma.user.findUnique({ where: { id: counselorId } });
        if (!counselor) {
            res.status(404).json({ success: false, error: "Counselor not found" });
            return;
        }

        const appointment = await prisma.appointment.create({
            data: {
                studentId,
                counselorId,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                reason,
                status: "PENDING", // Default
            },
        });

        res.status(201).json({ success: true, data: appointment });
    } catch (error) {
        console.error("Book Appointment Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

/**
 * Get Appointments (Filter by User)
 */
export const getAppointments = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, role } = req.query; // in real auth, get from req.user

        if (!userId) {
            res.status(400).json({ success: false, error: "User ID required" });
            return;
        }

        let whereClause = {};
        if (role === "COUNSELOR") {
            whereClause = { counselorId: String(userId) };
        } else {
            whereClause = { studentId: String(userId) };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                student: { select: { firstName: true, lastName: true, email: true } },
                counselor: { select: { firstName: true, lastName: true, email: true } },
            },
            orderBy: { startTime: "asc" },
        });

        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        console.error("Get Appointments Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

/**
 * Update Appointment Status (Counselor)
 */
export const updateAppointmentStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!Object.values(AppointmentStatus).includes(status)) {
            res.status(400).json({ success: false, error: "Invalid status" });
            return;
        }

        const updated = await prisma.appointment.update({
            where: { id },
            data: { status, notes },
        });

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        console.error("Update Appointment Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};
