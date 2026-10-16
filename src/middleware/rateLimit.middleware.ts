import rateLimit from "express-rate-limit";

const MINUTE = 60 * 1000;

const make = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });

/**
 * One limiter instance per endpoint. Each instance keeps its own per-IP counter,
 * so an unrelated request (e.g. the org-type lookup that fires as an email is
 * typed) can never use up the budget of login, password reset, etc.
 */
export const limiters = {
  // Password sign-in
  userLogin: make(15 * MINUTE, 10, "Too many login attempts. Please try again in 15 minutes."),
  adminLogin: make(15 * MINUTE, 10, "Too many login attempts. Please try again in 15 minutes."),
  superLogin: make(15 * MINUTE, 10, "Too many login attempts. Please try again in 15 minutes."),

  // Account creation / recovery
  signup: make(60 * MINUTE, 10, "Too many sign-up attempts. Please try again later."),
  forgotPassword: make(15 * MINUTE, 5, "Too many reset requests. Please try again in 15 minutes."),

  // Fires in the background as an email is typed, so it needs headroom
  orgLookup: make(15 * MINUTE, 60, "Too many lookups. Please slow down and try again shortly."),

  // Emailing a sign-in code
  parentCode: make(15 * MINUTE, 6, "Too many code requests. Please try again in 15 minutes."),
  adminResend: make(15 * MINUTE, 6, "Too many code requests. Please try again in 15 minutes."),
  superResend: make(15 * MINUTE, 6, "Too many code requests. Please try again in 15 minutes."),

  // Checking a code
  adminOtp: make(10 * MINUTE, 5, "Too many OTP attempts. Please request a new code."),
  superOtp: make(10 * MINUTE, 5, "Too many OTP attempts. Please request a new code."),
  parentOtp: make(10 * MINUTE, 5, "Too many OTP attempts. Please request a new code."),
};
