import crypto from "crypto";

/**
 * 🔢 Generates a secure 6-digit numeric OTP
 */
export const generateOTP = (): string => {
  // Generates a cryptographically strong random number between 0 and 999,999
  const otp = crypto.randomInt(100000, 999999);
  return otp.toString();
};
