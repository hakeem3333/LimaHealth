import type { Request, Response } from "express";
/**
 * Retrieves all mood logs from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllMoodLogs: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single mood log by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getMoodLogById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new mood log.
 * @param req The Express request object with the new mood log data.
 * @param res The Express response object.
 */
export declare const createMoodLog: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing mood log by its ID.
 * @param req The Express request object with the updated mood log data.
 * @param res The Express response object.
 */
export declare const updateMoodLog: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a mood log by its ID.
 * @param req The Express request object with the mood log ID.
 * @param res The Express response object.
 */
export declare const deleteMoodLog: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=moodLog.controller.d.ts.map