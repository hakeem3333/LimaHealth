import type { Request, Response } from "express";
/**
 * Retrieves all users from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllUsers: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single user by their ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getUserById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new user.
 * @param req The Express request object with the new user data.
 * @param res The Express response object.
 */
export declare const createUser: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing user by their ID.
 * @param req The Express request object with the updated user data.
 * @param res The Express response object.
 */
export declare const updateUser: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a user by their ID.
 * @param req The Express request object with the user ID.
 * @param res The Express response object.
 */
export declare const deleteUser: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=user.controller.d.ts.map