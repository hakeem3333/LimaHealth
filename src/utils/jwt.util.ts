import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secure-secret";

/**
 * 🛠️ JWT Utility Functions
 * Handles signing and verification for different token types.
 */

// 1. Access Token: Very short-lived (15 minutes)
export const signAccessToken = (payload: object) => {
  return jwt.sign({ ...payload, type: "ACCESS" }, JWT_SECRET, {
    expiresIn: "15m",
  });
};

// 2. Refresh Token: Long-lived (7 days)
export const signRefreshToken = (payload: object) => {
  return jwt.sign({ ...payload, type: "REFRESH" }, JWT_SECRET, {
    expiresIn: "7d",
  });
};

// 3. Temp Token: Used for OTP/Verification flows (5-10 minutes)
export const signTempToken = (payload: object) => {
  return jwt.sign({ ...payload, purpose: "ADMIN_OTP" }, JWT_SECRET, {
    expiresIn: "10m",
  });
};

/**
 * 🛡️ Verify Token
 * Safely handles verification and returns a standardized object.
 * Fixes ESM issues by avoiding direct "instanceof" checks on named exports.
 */
export const verifyToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, decoded, error: null };
  } catch (err: any) {
    return {
      valid: false,
      decoded: null,
      error: err.name, // Returns "TokenExpiredError" or "JsonWebTokenError"
    };
  }
};

/**
 * 🔒 Token Hashing (For Database Storage)
 * Used to hash UUID verification tokens so plaintext tokens
 * are never stored in the database.
 */
export const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
