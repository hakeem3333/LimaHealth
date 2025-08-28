import { Router } from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";

const router = Router();

/**
 * @swagger
 * tags:
 * name: Users
 * description: API endpoints for managing users.
 */

/**
 * @swagger
 * /users:
 * post:
 * summary: Creates a new user.
 * tags: [Users]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * email:
 * type: string
 * password:
 * type: string
 * schoolId:
 * type: string
 * roleId:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new user.
 * 400:
 * description: Invalid input.
 */
router.post("/", createUser);

/**
 * @swagger
 * /users:
 * get:
 * summary: Retrieves a list of all users.
 * tags: [Users]
 * responses:
 * 200:
 * description: A list of users.
 */
router.get("/", getAllUsers);

/**
 * @swagger
 * /users/{id}:
 * get:
 * summary: Retrieves a user by their ID.
 * tags: [Users]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The user's ID.
 * responses:
 * 200:
 * description: A single user object.
 * 404:
 * description: User not found.
 */
router.get("/:id", getUserById);

/**
 * @swagger
 * /users/{id}:
 * put:
 * summary: Updates a user by their ID.
 * tags: [Users]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The user's ID.
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * email:
 * type: string
 * password:
 * type: string
 * schoolId:
 * type: string
 * roleId:
 * type: string
 * responses:
 * 200:
 * description: Successfully updated the user.
 * 404:
 * description: User not found.
 * 400:
 * description: Invalid input.
 */
router.put("/:id", updateUser);

/**
 * @swagger
 * /users/{id}:
 * delete:
 * summary: Deletes a user by their ID.
 * tags: [Users]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: The user's ID.
 * responses:
 * 204:
 * description: User successfully deleted.
 * 404:
 * description: User not found.
 */
router.delete("/:id", deleteUser);

export default router;
