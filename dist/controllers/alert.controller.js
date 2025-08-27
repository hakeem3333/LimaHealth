import { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { Alert } from "../types/models";
/**
 * Retrieves all alerts from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllAlerts = async (req, res) => {
    try {
        const alerts = await prisma.alert.findMany({
            include: {
                student: true,
                counselor: true,
            },
        });
        res.status(200).json(alerts);
    }
    catch (error) {
        console.error("Error fetching alerts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Retrieves a single alert by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAlertById = async (req, res) => {
    const { id } = req.params;
    try {
        const alert = await prisma.alert.findUnique({
            where: { id },
            include: {
                student: true,
                counselor: true,
            },
        });
        if (!alert) {
            res.status(404).json({ message: "Alert not found" });
            return;
        }
        res.status(200).json(alert);
    }
    catch (error) {
        console.error("Error fetching alert by ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Creates a new alert.
 * @param req The Express request object with the new alert data.
 * @param res The Express response object.
 */
export const createAlert = async (req, res) => {
    const { studentId, counselorId, alertType, message, isResolved, notes } = req.body;
    try {
        const newAlert = await prisma.alert.create({
            data: {
                studentId,
                counselorId,
                alertType,
                message,
                isResolved,
                notes,
            },
        });
        res.status(201).json(newAlert);
    }
    catch (error) {
        console.error("Error creating alert:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Updates an existing alert by its ID.
 * @param req The Express request object with the updated alert data.
 * @param res The Express response object.
 */
export const updateAlert = async (req, res) => {
    const { id } = req.params;
    const { studentId, counselorId, alertType, message, isResolved, notes } = req.body;
    try {
        const updatedAlert = await prisma.alert.update({
            where: { id },
            data: {
                studentId,
                counselorId,
                alertType,
                message,
                isResolved,
                notes,
            },
        });
        res.status(200).json(updatedAlert);
    }
    catch (error) {
        console.error("Error updating alert:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Deletes an alert by its ID.
 * @param req The Express request object with the alert ID.
 * @param res The Express response object.
 */
export const deleteAlert = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.alert.delete({
            where: { id },
        });
        res.status(204).send(); // 204 No Content for a successful delete
    }
    catch (error) {
        console.error("Error deleting alert:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
//# sourceMappingURL=alert.controller.js.map