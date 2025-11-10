import { Router } from "express";
import { createRole, getAllRoles, getRoleById, updateRole, deleteRole, } from "../controllers/role.controller";
const router = Router();
/**
 * @swagger
 * tags:
 * name: Roles
 * description: API endpoints for managing user roles.
 */
/**
 * @swagger
 * /roles:
 * post:
 * summary: Creates a new role.
 * tags: [Roles]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * name:
 * type: string
 * description:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new role.
 * 400:
 * description: Invalid input.
 */
router.post("/", createRole);
/**
 * @swagger
 * /roles:
 * get:
 * summary: Retrieves a list of all roles.
 * tags: [Roles]
 * responses:
 * 200:
 * description: A list of roles.
 */
router.get("/", getAllRoles);
/**
 * @swagger
 * /roles/{id}:
 * get:
 * summary: Retrieves a role by its ID.
 * tags: [Roles]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The role's ID.
 * responses:
 * 200:
 * description: A single role object.
 * 404:
 * description: Role not found.
 */
router.get("/:id", getRoleById);
/**
 * @swagger
 * /roles/{id}:
 * put:
 * summary: Updates a role by its ID.
 * tags: [Roles]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The role's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * name:
 * type: string
 * description:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the role.
 * 404:
 * description: Role not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateRole);
/**
 * @swagger
 * /roles/{id}:
 * delete:
 * summary: Deletes a role by its ID.
 * tags: [Roles]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The role's ID.
 * responses:
 * 204:
 * description: Role successfully deleted.
 * 404:
 * description: Role not found.
 */
router.delete("/:id", deleteRole);
export default router;
//# sourceMappingURL=role.routes.js.map