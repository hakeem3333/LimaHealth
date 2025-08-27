import { Request, Response } from "express";
/**
 * Retrieves all schools from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllSchools: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single school by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getSchoolById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new school.
 * @param req The Express request object with the new school data.
 * @param res The Express response object.
 */
export declare const createSchool: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing school by its ID.
 * @param req The Express request object with the updated school data.
 * @param res The Express response object.
 */
export declare const updateSchool: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a school by its ID.
 * @param req The Express request object with the school ID.
 * @param res The Express response object.
 */
export declare const deleteSchool: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=school.controller.d.ts.map