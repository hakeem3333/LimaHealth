import rateLimit from "express-rate-limit";

/**
 * Strict limiter for authentication endpoints.
 * Allows 10 attempts per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

/**
 * Strict limiter for OTP verification endpoints.
 * Allows 5 attempts per 10 minutes per IP.
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many OTP attempts. Please request a new code.",
  },
});
