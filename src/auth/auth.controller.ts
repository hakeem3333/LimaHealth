import { Request, Response } from "express";
import * as AuthService from "./auth.service";

/**
 * LOGIN CONTROLLER WITH RBAC + schoolAdmin 2FA
 */
export const login = async (req: Request, res: Response) => {
  const { email, password, otp, tempToken } = req.body;

  // 1️⃣ Step 1 — First login attempt (no OTP yet)
  if (!otp && !tempToken) {
    const response = await AuthService.loginStep1(email, password);

    // 👉 If schoolAdmin, return ONLY OTP + tempToken (NO access tokens)
    if (response.role === "schoolAdmin" && response.requires2FA) {
      return res.status(200).json({
        message: "OTP sent to email. Complete 2FA.",
        tempToken: response.tempToken,
      });
    }

    // 👉 If normal user (student or counsellor), return tokens immediately
    return res.status(200).json({
      message: "Login successful",
      ...response,
    });
  }

  // 2️⃣ Step 2 — schoolAdmin submits OTP
  if (otp && tempToken) {
    const finalTokens = await AuthService.loginStep2(tempToken, otp);

    return res.status(200).json({
      message: "schoolAdmin login successful",
      ...finalTokens,
    });
  }

  return res.status(400).json({
    message: "Invalid login request format.",
  });
};

/**
 * LOGOUT
 */
export const logout = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await AuthService.logout(userId);
  return res.status(200).json({ message: "Logged out successfully" });
};

/**
 * REFRESH TOKEN
 */
export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const newTokens = await AuthService.refresh(refreshToken);
  return res.status(200).json(newTokens);
};

/**
 * FORGOT PASSWORD
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  await AuthService.forgotPassword(email);
  return res.status(200).json({
    message: "Password reset email sent",
  });
};

/**
 * RESET PASSWORD
 */
export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  await AuthService.resetPassword(token, newPassword);
  return res.status(200).json({
    message: "Password has been reset successfully",
  });
};
