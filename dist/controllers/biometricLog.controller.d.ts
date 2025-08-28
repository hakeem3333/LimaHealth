import type { Request, Response } from "express";
/**
 * Retrieves all biometric logs from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllBiometricLogs: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single biometric log by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getBiometricLogById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new biometric log.
 * @param req The Express request object with the new biometric log data.
 * @param res The Express response object.
 */
export declare const createBiometricLog: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing biometric log by its ID.
 * @param req The Express request object with the updated biometric log data.
 * @param res The Express response object.
 */
export declare const updateBiometricLog: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a biometric log by its ID.
 * @param req The Express request object with the biometric log ID.
 * @param res The Express response object.
 */
export declare const deleteBiometricLog: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=biometricLog.controller.d.ts.map