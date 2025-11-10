import { Router } from "express";
import { createSubscription, getAllSubscriptions, getSubscriptionById, updateSubscription, deleteSubscription, } from "../controllers/subscription.controller";
const router = Router();
/**
 * @swagger
 * tags:
 * name: Subscriptions
 * description: API endpoints for managing school subscriptions.
 */
/**
 * @swagger
 * /subscriptions:
 * post:
 * summary: Creates a new subscription.
 * tags: [Subscriptions]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * schoolId:
 * type: string
 * startDate:
 * type: string
 * endDate:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new subscription.
 * 400:
 * description: Invalid input.
 */
router.post("/", createSubscription);
/**
 * @swagger
 * /subscriptions:
 * get:
 * summary: Retrieves a list of all subscriptions.
 * tags: [Subscriptions]
 * responses:
 * 200:
 * description: A list of subscriptions.
 */
router.get("/", getAllSubscriptions);
/**
 * @swagger
 * /subscriptions/{id}:
 * get:
 * summary: Retrieves a subscription by its ID.
 * tags: [Subscriptions]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The subscription's ID.
 * responses:
 * 200:
 * description: A single subscription object.
 * 404:
 * description: Subscription not found.
 */
router.get("/:id", getSubscriptionById);
/**
 * @swagger
 * /subscriptions/{id}:
 * put:
 * summary: Updates a subscription by its ID.
 * tags: [Subscriptions]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The subscription's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * startDate:
 * type: string
 * endDate:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the subscription.
 * 404:
 * description: Subscription not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateSubscription);
/**
 * @swagger
 * /subscriptions/{id}:
 * delete:
 * summary: Deletes a subscription by its ID.
 * tags: [Subscriptions]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The subscription's ID.
 * responses:
 * 204:
 * description: Subscription successfully deleted.
 * 404:
 * description: Subscription not found.
 */
router.delete("/:id", deleteSubscription);
export default router;
//# sourceMappingURL=subscription.routes.js.map