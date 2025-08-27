import { Request, Response } from "express";
/**
 * Retrieves all consent records from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllConsents: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single consent record by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getConsentById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new consent record.
 * @param req The Express request object with the new consent data.
 * @param res The Express response object.
 */
export declare const createConsent: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing consent record by its ID.
 * @param req The Express request object with the updated consent data.
 * @param res The Express response object.
 */
export declare const updateConsent: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a consent record by its ID.
 * @param req The Express request object with the consent record ID.
 * @param res The Express response object.
 */
export declare const deleteConsent: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=consent.controller.d.ts.map