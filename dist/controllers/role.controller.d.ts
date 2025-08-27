import { Request, Response } from "express";
/**
 * Retrieves all roles from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllRoles: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single role by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getRoleById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new role.
 * @param req The Express request object with the new role data.
 * @param res The Express response object.
 */
export declare const createRole: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing role by its ID.
 * @param req The Express request object with the updated role data.
 * @param res The Express response object.
 */
export declare const updateRole: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a role by its ID.
 * @param req The Express request object with the role ID.
 * @param res The Express response object.
 */
export declare const deleteRole: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=role.controller.d.ts.map