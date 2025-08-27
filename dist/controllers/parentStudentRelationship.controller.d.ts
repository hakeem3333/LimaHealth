import { Request, Response } from "express";
/**
 * Retrieves all parent-student relationships from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllParentStudentRelationships: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single parent-student relationship by its composite ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getParentStudentRelationshipById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new parent-student relationship.
 * @param req The Express request object with the new relationship data.
 * @param res The Express response object.
 */
export declare const createParentStudentRelationship: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing parent-student relationship by its composite ID.
 * @param req The Express request object with the updated relationship data.
 * @param res The Express response object.
 */
export declare const updateParentStudentRelationship: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a parent-student relationship by its composite ID.
 * @param req The Express request object with the relationship IDs.
 * @param res The Express response object.
 */
export declare const deleteParentStudentRelationship: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=parentStudentRelationship.controller.d.ts.map