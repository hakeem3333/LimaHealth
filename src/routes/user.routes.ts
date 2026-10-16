import { Router } from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  registerPushToken,
  uploadProfileImage,
  updateProfileImage,
  deleteProfileImage,
  getMyCounselor,
} from "../controllers/user.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

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
 * orgId:
 * type: string
 * roleId:
 * type: string
 * responses:
 * 201:
 * description: Successfully created a new user.
 * 400:
 * description: Invalid input.
 */
router.post("/", authenticate, authorizeRole("SUPER_ADMIN"), createUser);

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
router.get("/", authenticate, getAllUsers);

/**
 * @swagger
 * /users/me/push-token:
 * patch:
 * summary: Registers the caller's own Expo push token for this device.
 * tags: [Users]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * pushToken:
 * type: string
 * responses:
 * 200:
 * description: Token registered.
 * 400:
 * description: Invalid input.
 */
router.patch("/me/push-token", authenticate, registerPushToken);

/**
 * @swagger
 * /users/me/counselor:
 *   get:
 *     summary: Returns the caller's own assigned counselor, if any.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: The assigned counselor (or null).
 */
router.get("/me/counselor", authenticate, getMyCounselor);

/**
 * @swagger
 * /users/me/profile-image:
 *   patch:
 *     summary: Uploads (or replaces) the caller's own profile image.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile image updated.
 *       400:
 *         description: No image uploaded / invalid file.
 *   delete:
 *     summary: Removes the caller's own profile image.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Profile image removed.
 */
router.patch("/me/profile-image", authenticate, uploadProfileImage, updateProfileImage);
router.delete("/me/profile-image", authenticate, deleteProfileImage);

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
router.get("/:id", authenticate, authorizeRole("SUPER_ADMIN"), getUserById);

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
 * orgId:
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
router.put("/:id", authenticate, authorizeRole("SUPER_ADMIN"), updateUser);

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
router.delete("/:id", authenticate, authorizeRole("SUPER_ADMIN"), deleteUser);

export default router;
