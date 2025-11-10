import { Router } from "express";
import { createBiometricLog, getAllBiometricLogs, getBiometricLogById, updateBiometricLog, deleteBiometricLog, } from "../controllers/biometricLog.controller";
const router = Router();
/**
 * @swagger
 * tags:
 * name: BiometricLogs
 * description: API endpoints for managing biometric logs.
 */
/**
 * @swagger
 * /biometric-logs:
 * post:
 * summary: Creates a new biometric log.
 * tags: [BiometricLogs]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * userId:
 * type: string
 * heartRate:
 * type: number
 * steps:
 * type: number
 * caloriesBurned:
 * type: number
 * sleepDuration:
 * type: number
 * responses:
 * 201:
 * description: Successfully created a new biometric log.
 * 400:
 * description: Invalid input.
 */
router.post("/", createBiometricLog);
/**
 * @swagger
 * /biometric-logs:
 * get:
 * summary: Retrieves a list of all biometric logs.
 * tags: [BiometricLogs]
 * responses:
 * 200:
 * description: A list of biometric logs.
 */
router.get("/", getAllBiometricLogs);
/**
 * @swagger
 * /biometric-logs/{id}:
 * get:
 * summary: Retrieves a biometric log by its ID.
 * tags: [BiometricLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The biometric log's ID.
 * responses:
 * 200:
 * description: A single biometric log object.
 * 404:
 * description: Biometric log not found.
 */
router.get("/:id", getBiometricLogById);
/**
 * @swagger
 * /biometric-logs/{id}:
 * put:
 * summary: Updates a biometric log by its ID.
 * tags: [BiometricLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The biometric log's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * heartRate:
 * type: number
 * steps:
 * type: number
 * caloriesBurned:
 * type: number
 * sleepDuration:
 * type: number
 * responses:
 * 200:
 * description: Successfully updated the biometric log.
 * 404:
 * description: Biometric log not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateBiometricLog);
/**
 * @swagger
 * /biometric-logs/{id}:
 * delete:
 * summary: Deletes a biometric log by its ID.
 * tags: [BiometricLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The biometric log's ID.
 * responses:
 * 204:
 * description: Biometric log successfully deleted.
 * 404:
 * description: Biometric log not found.
 */
router.delete("/:id", deleteBiometricLog);
export default router;
//# sourceMappingURL=biometricLog.routes.js.map