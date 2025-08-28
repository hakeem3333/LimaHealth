import prisma from "../services/prisma.service";
/**
 * Retrieves all consent records from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllConsents = async (req, res) => {
    try {
        const consents = await prisma.consent.findMany({
            include: {
                user: true,
            },
        });
        res.status(200).json(consents);
    }
    catch (error) {
        console.error("Error fetching consents:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Retrieves a single consent record by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getConsentById = async (req, res) => {
    const { id } = req.params;
    try {
        const consent = await prisma.consent.findUnique({
            where: { id },
            include: {
                user: true,
            },
        });
        if (!consent) {
            res.status(404).json({ message: "Consent record not found" });
            return;
        }
        res.status(200).json(consent);
    }
    catch (error) {
        console.error("Error fetching consent by ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Creates a new consent record.
 * @param req The Express request object with the new consent data.
 * @param res The Express response object.
 */
export const createConsent = async (req, res) => {
    const { userId, consentGiven, anonymizeData, parentalConsentGiven } = req.body;
    try {
        const newConsent = await prisma.consent.create({
            data: {
                userId,
                consentGiven,
                anonymizeData,
                parentalConsentGiven,
            },
        });
        res.status(201).json(newConsent);
    }
    catch (error) {
        console.error("Error creating consent record:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Updates an existing consent record by its ID.
 * @param req The Express request object with the updated consent data.
 * @param res The Express response object.
 */
export const updateConsent = async (req, res) => {
    const { id } = req.params;
    const { userId, consentGiven, anonymizeData, parentalConsentGiven } = req.body;
    try {
        const updatedConsent = await prisma.consent.update({
            where: { id },
            data: {
                userId,
                consentGiven,
                anonymizeData,
                parentalConsentGiven,
            },
        });
        res.status(200).json(updatedConsent);
    }
    catch (error) {
        console.error("Error updating consent record:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Deletes a consent record by its ID.
 * @param req The Express request object with the consent record ID.
 * @param res The Express response object.
 */
export const deleteConsent = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.consent.delete({
            where: { id },
        });
        res.status(204).send(); // 204 No Content for a successful delete
    }
    catch (error) {
        console.error("Error deleting consent record:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
//# sourceMappingURL=consent.controller.js.map