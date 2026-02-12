import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secure-secret";

/**
 * 🛠️ JWT Utility Functions
 */

// 1. Access Token: Added schoolStatus to the payload for Middleware checks
export const signAccessToken = (payload: {
  sub: string;
  role: string;
  schoolId?: string;
  schoolStatus: string;
}) => {
  return jwt.sign({ ...payload, type: "ACCESS" }, JWT_SECRET, {
    expiresIn: "15m",
  });
};

// 2. Refresh Token: Standard 7 days
export const signRefreshToken = (payload: { sub: string }) => {
  return jwt.sign({ ...payload, type: "REFRESH" }, JWT_SECRET, {
    expiresIn: "7d",
  });
};

// 3. Temp Token: Unchanged
export const signTempToken = (payload: { userId: string }) => {
  return jwt.sign({ ...payload, purpose: "ADMIN_OTP" }, JWT_SECRET, {
    expiresIn: "10m",
  });
};

/**
 * 🛡️ Verify Token
 */
export const verifyToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, decoded, error: null };
  } catch (err: any) {
    return {
      valid: false,
      decoded: null,
      error: err.name,
    };
  }
};

/**
 * 🔒 Token Hashing
 */
export const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
