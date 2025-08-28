import { Router } from "express";
import { createParentStudentRelationship, getAllParentStudentRelationships, getParentStudentRelationshipById, updateParentStudentRelationship, deleteParentStudentRelationship, } from "../controllers/parentStudentRelationship.controller";
const router = Router();
/**
 * @swagger
 * tags:
 * name: ParentStudentRelationships
 * description: API endpoints for managing parent-student relationships.
 */
/**
 * @swagger
 * /parent-student-relationships:
 * post:
 * summary: Creates a new parent-student relationship.
 * tags: [ParentStudentRelationships]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * parentId:
 * type: string
 * studentId:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new parent-student relationship.
 * 400:
 * description: Invalid input.
 */
router.post("/", createParentStudentRelationship);
/**
 * @swagger
 * /parent-student-relationships:
 * get:
 * summary: Retrieves a list of all parent-student relationships.
 * tags: [ParentStudentRelationships]
 * responses:
 * 200:
 * description: A list of parent-student relationships.
 */
router.get("/", getAllParentStudentRelationships);
/**
 * @swagger
 * /parent-student-relationships/{id}:
 * get:
 * summary: Retrieves a parent-student relationship by its ID.
 * tags: [ParentStudentRelationships]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The relationship's ID.
 * responses:
 * 200:
 * description: A single parent-student relationship object.
 * 404:
 * description: Relationship not found.
 */
router.get("/:id", getParentStudentRelationshipById);
/**
 * @swagger
 * /parent-student-relationships/{id}:
 * put:
 * summary: Updates a parent-student relationship by its ID.
 * tags: [ParentStudentRelationships]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The relationship's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * parentId:
 * type: string
 * studentId:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the relationship.
 * 404:
 * description: Relationship not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateParentStudentRelationship);
/**
 * @swagger
 * /parent-student-relationships/{id}:
 * delete:
 * summary: Deletes a parent-student relationship by its ID.
 * tags: [ParentStudentRelationships]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The relationship's ID.
 * responses:
 * 204:
 * description: Relationship successfully deleted.
 * 404:
 * description: Relationship not found.
 */
router.delete("/:id", deleteParentStudentRelationship);
export default router;
//# sourceMappingURL=parentStudentRelationship.routes.js.map