import type { Request, Response } from "express";
/**
 * Retrieves all subscriptions from the database.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getAllSubscriptions: (req: Request, res: Response) => Promise<void>;
/**
 * Retrieves a single subscription by its ID.
 * @param req The Express request object.
 * @param res The Express response object.
 */
export declare const getSubscriptionById: (req: Request, res: Response) => Promise<void>;
/**
 * Creates a new subscription.
 * @param req The Express request object with the new subscription data.
 * @param res The Express response object.
 */
export declare const createSubscription: (req: Request, res: Response) => Promise<void>;
/**
 * Updates an existing subscription by its ID.
 * @param req The Express request object with the updated subscription data.
 * @param res The Express response object.
 */
export declare const updateSubscription: (req: Request, res: Response) => Promise<void>;
/**
 * Deletes a subscription by its ID.
 * @param req The Express request object with the subscription ID.
 * @param res The Express response object.
 */
export declare const deleteSubscription: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=subscription.controller.d.ts.map