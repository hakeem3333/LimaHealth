import { Router } from "express";
import { createMoodLog, getAllMoodLogs, getMoodLogById, updateMoodLog, deleteMoodLog, } from "../controllers/moodLog.controller";
const router = Router();
/**
 * @swagger
 * tags:
 * name: MoodLogs
 * description: API endpoints for managing mood logs.
 */
/**
 * @swagger
 * /mood-logs:
 * post:
 * summary: Creates a new mood log.
 * tags: [MoodLogs]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * userId:
 * type: string
 * mood:
 * type: string
 * note:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new mood log.
 * 400:
 * description: Invalid input.
 */
router.post("/", createMoodLog);
/**
 * @swagger
 * /mood-logs:
 * get:
 * summary: Retrieves a list of all mood logs.
 * tags: [MoodLogs]
 * responses:
 * 200:
 * description: A list of mood logs.
 */
router.get("/", getAllMoodLogs);
/**
 * @swagger
 * /mood-logs/{id}:
 * get:
 * summary: Retrieves a mood log by its ID.
 * tags: [MoodLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The mood log's ID.
 * responses:
 * 200:
 * description: A single mood log object.
 * 404:
 * description: Mood log not found.
 */
router.get("/:id", getMoodLogById);
/**
 * @swagger
 * /mood-logs/{id}:
 * put:
 * summary: Updates a mood log by its ID.
 * tags: [MoodLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The mood log's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * mood:
 * type: string
 * note:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the mood log.
 * 404:
 * description: Mood log not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateMoodLog);
/**
 * @swagger
 * /mood-logs/{id}:
 * delete:
 * summary: Deletes a mood log by its ID.
 * tags: [MoodLogs]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The mood log's ID.
 * responses:
 * 204:
 * description: Mood log successfully deleted.
 * 404:
 * description: Mood log not found.
 */
router.delete("/:id", deleteMoodLog);
export default router;
//# sourceMappingURL=moodLog.routes.js.map