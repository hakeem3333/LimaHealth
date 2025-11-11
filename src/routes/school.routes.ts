import { Router } from "express";
import {
  // createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
} from "../controllers/school.controller";

const router = Router();

/**
 * @swagger
 * tags:
 * name: Schools
 * description: API endpoints for managing schools.
 */

/**
 * @swagger
 * /schools:
 * post:
 * summary: Creates a new school.
 * tags: [Schools]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * name:
 * type: string
 * address:
 * type: string
 * phone:
 * type: string
 * email:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new school.
 * 400:
 * description: Invalid input.
 */
// router.post("/", createSchool);

/**
 * @swagger
 * /schools:
 * get:
 * summary: Retrieves a list of all schools.
 * tags: [Schools]
 * responses:
 * 200:
 * description: A list of schools.
 */
router.get("/", getAllSchools);

/**
 * @swagger
 * /schools/{id}:
 * get:
 * summary: Retrieves a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The school's ID.
 * responses:
 * 200:
 * description: A single school object.
 * 404:
 * description: School not found.
 */
router.get("/:id", getSchoolById);

/**
 * @swagger
 * /schools/{id}:
 * put:
 * summary: Updates a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The school's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * name:
 * type: string
 * address:
 * type: string
 * phone:
 * type: string
 * email:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the school.
 * 404:
 * description: School not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateSchool);

/**
 * @swagger
 * /schools/{id}:
 * delete:
 * summary: Deletes a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The school's ID.
 * responses:
 * 204:
 * description: School successfully deleted.
 * 404:
 * description: School not found.
 */
router.delete("/:id", deleteSchool);

export default router;
