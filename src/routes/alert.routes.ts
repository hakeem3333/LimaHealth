import { Router } from "express";
import {
  createAlert,
  getAlerts,
  getAlertById,
  updateAlert,
  deleteAlert,
} from "../controllers/alert.controller";

const router = Router();

/**
 * @swagger
 * tags:
 * name: Alerts
 * description: API endpoints for managing alerts.
 */

/**
 * @swagger
 * /alerts:
 * post:
 * summary: Creates a new alert.
 * tags: [Alerts]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * studentId:
 * type: string
 * counselorId:
 * type: string
 * message:
 * type: string
 * status:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new alert.
 * 400:
 * description: Invalid input.
 */
router.post("/", createAlert);

/**
 * @swagger
 * /alerts:
 * get:
 * summary: Retrieves a list of all alerts.
 * tags: [Alerts]
 * responses:
 * 200:
 * description: A list of alerts.
 */
router.get("/", getAlerts);

/**
 * @swagger
 * /alerts/{id}:
 * get:
 * summary: Retrieves an alert by its ID.
 * tags: [Alerts]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The alert's ID.
 * responses:
 * 200:
 * description: A single alert object.
 * 404:
 * description: Alert not found.
 */
router.get("/:id", getAlertById);

/**
 * @swagger
 * /alerts/{id}:
 * put:
 * summary: Updates an alert by its ID.
 * tags: [Alerts]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The alert's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * message:
 * type: string
 * status:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the alert.
 * 404:
 * description: Alert not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateAlert);

/**
 * @swagger
 * /alerts/{id}:
 * delete:
 * summary: Deletes an alert by its ID.
 * tags: [Alerts]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The alert's ID.
 * responses:
 * 204:
 * description: Alert successfully deleted.
 * 404:
 * description: Alert not found.
 */
router.delete("/:id", deleteAlert);

export default router;
