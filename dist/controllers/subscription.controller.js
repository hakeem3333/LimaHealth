import prisma from "../services/prisma.service";
/**
 * Retrieves all subscriptions from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getAllSubscriptions = async (req, res) => {
    try {
        const subscriptions = await prisma.subscription.findMany({
            include: {
                school: true,
            },
        });
        res.status(200).json(subscriptions);
    }
    catch (error) {
        console.error("Error fetching subscriptions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Retrieves a single subscription by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export const getSubscriptionById = async (req, res) => {
    const { id } = req.params;
    try {
        const subscription = await prisma.subscription.findUnique({
            where: { id },
            include: {
                school: true,
            },
        });
        if (!subscription) {
            res.status(404).json({ message: "Subscription not found" });
            return;
        }
        res.status(200).json(subscription);
    }
    catch (error) {
        console.error("Error fetching subscription by ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Creates a new subscription.
 * @param req The Express request object with the new subscription data.
 * @param res The Express response object.
 */
export const createSubscription = async (req, res) => {
    const { schoolId, stripeSubscriptionId, planTier, status, currentPeriodEnd } = req.body;
    try {
        const newSubscription = await prisma.subscription.create({
            data: {
                schoolId,
                stripeSubscriptionId,
                planTier,
                status,
                currentPeriodEnd: new Date(currentPeriodEnd),
            },
        });
        res.status(201).json(newSubscription);
    }
    catch (error) {
        console.error("Error creating subscription:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Updates an existing subscription by its ID.
 * @param req The Express request object with the updated subscription data.
 * @param res The Express response object.
 */
export const updateSubscription = async (req, res) => {
    const { id } = req.params;
    const { schoolId, stripeSubscriptionId, planTier, status, currentPeriodEnd } = req.body;
    try {
        const updatedSubscription = await prisma.subscription.update({
            where: { id },
            data: {
                schoolId,
                stripeSubscriptionId,
                planTier,
                status,
                currentPeriodEnd: new Date(currentPeriodEnd),
            },
        });
        res.status(200).json(updatedSubscription);
    }
    catch (error) {
        console.error("Error updating subscription:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
/**
 * Deletes a subscription by its ID.
 * @param req The Express request object with the subscription ID.
 * @param res The Express response object.
 */
export const deleteSubscription = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.subscription.delete({
            where: { id },
        });
        res.status(204).send(); // 204 No Content for a successful delete
    }
    catch (error) {
        console.error("Error deleting subscription:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
//# sourceMappingURL=subscription.controller.js.map