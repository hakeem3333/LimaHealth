import { Request, Response } from "express";
/**
 * Retrieves all alerts from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllAlerts: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single alert by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAlertById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new alert.
 * @param req The Express request object with the new alert data.
 * @param res The Express response object.
 */
export declare const createAlert: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing alert by its ID.
 * @param req The Express request object with the updated alert data.
 * @param res The Express response object.
 */
export declare const updateAlert: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes an alert by its ID.
 * @param req The Express request object with the alert ID.
 * @param res The Express response object.
 */
export declare const deleteAlert: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=alert.controller.d.ts.map