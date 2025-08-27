import { Router } from "express";
import {
  createConsent,
  getConsents,
  getConsentById,
  updateConsent,
  deleteConsent,
} from "../controllers/consent.controller";

const router = Router();

/**
 * @swagger
 * tags:
 * name: Consents
 * description: API endpoints for managing consents.
 */

/**
 * @swagger
 * /consents:
 * post:
 * summary: Creates a new consent.
 * tags: [Consents]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * userId:
 * type: string
 * givenAt:
 * type: string
 * revokedAt:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new consent.
 * 400:
 * description: Invalid input.
 */
router.post("/", createConsent);

/**
 * @swagger
 * /consents:
 * get:
 * summary: Retrieves a list of all consents.
 * tags: [Consents]
 * responses:
 * 200:
 * description: A list of consents.
 */
router.get("/", getConsents);

/**
 * @swagger
 * /consents/{id}:
 * get:
 * summary: Retrieves a consent by its ID.
 * tags: [Consents]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The consent's ID.
 * responses:
 * 200:
 * description: A single consent object.
 * 404:
 * description: Consent not found.
 */
router.get("/:id", getConsentById);

/**
 * @swagger
 * /consents/{id}:
 * put:
 * summary: Updates a consent by its ID.
 * tags: [Consents]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The consent's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * givenAt:
 * type: string
 * revokedAt:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the consent.
 * 404:
 * description: Consent not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateConsent);

/**
 * @swagger
 * /consents/{id}:
 * delete:
 * summary: Deletes a consent by its ID.
 * tags: [Consents]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The consent's ID.
 * responses:
 * 204:
 * description: Consent successfully deleted.
 * 404:
 * description: Consent not found.
 */
router.delete("/:id", deleteConsent);

export default router;
