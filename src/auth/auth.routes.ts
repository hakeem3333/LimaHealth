import { Router } from "express";
import * as AuthController from "./auth.controller";
import { authenticate } from "./middleware/authenticate";

const router = Router();

// Public
router.post("/login", AuthController.login);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

// Protected
router.post("/logout", authenticate, AuthController.logout);
router.post("/refresh-token", AuthController.refreshToken);

export default router;
