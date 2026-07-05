import { Router } from "express";
import {
  createOrganisation,
  getAllOrgs,
  getOrgById,
  updateOrganisation,
  deleteOrg,
} from "../controllers/organisation.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

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
 *   required: true
 *   content:
 *     application/json:
 *       schema:
 *         type: object
 *         properties:
 *           name:
 *             type: string
 *           address:
 *             type: string
 *           phone:
 *             type: string
 *           email:
 *             type: string
 * responses:
 *   201:
 *     description: Successfully created a new school.
 *   400:
 *     description: Invalid input.
 */
router.post("/", authenticate, authorizeRole("manage_organisations"), createOrganisation);

/**
 * @swagger
 * /schools:
 * get:
 * summary: Retrieves a list of all schools.
 * tags: [Schools]
 * responses:
 *   200:
 *     description: A list of schools.
 */
router.get("/", authenticate, authorizeRole("manage_organisations"), getAllOrgs);

/**
 * @swagger
 * /organisations/{id}:
 * get:
 * summary: Retrieves a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 *   name: id
 *   required: true
 *   schema:
 *     type: string
 *   description: The school's ID.
 * responses:
 *   200:
 *     description: A single school object.
 *   404:
 *     description: Organisation not found.
 */
router.get("/:id", authenticate, authorizeRole("manage_organisations"), getOrgById);

/**
 * @swagger
 * /organisations/{id}:
 * put:
 * summary: Updates a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 *   name: id
 *   required: true
 *   schema:
 *     type: string
 *   description: The school's ID.
 * requestBody:
 *   required: true
 *   content:
 *     application/json:
 *       schema:
 *         type: object
 *         properties:
 *           name:
 *             type: string
 *           address:
 *             type: string
 *           phone:
 *             type: string
 *           email:
 *             type: string
 * responses:
 *   200:
 *     description: Successfully updated the school.
 *   404:
 *     description: Organisation not found.
 *   400:
 *     description: Invalid input.
 */
router.put("/:id", authenticate, authorizeRole("manage_organisations"), updateOrganisation);

/**
 * @swagger
 * /organisations/{id}:
 * delete:
 * summary: Deletes a school by its ID.
 * tags: [Schools]
 * parameters:
 * - in: path
 *   name: id
 *   required: true
 *   schema:
 *     type: string
 *   description: The school's ID.
 * responses:
 *   204:
 *     description: Organisation successfully deleted.
 *   404:
 *     description: Organisation not found.
 */
router.delete("/:id", authenticate, authorizeRole("manage_organisations"), deleteOrg);

export default router;
