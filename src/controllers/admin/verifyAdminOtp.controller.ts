import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { z } from "zod";

// Zod schema for OTP
const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

export const adminLoginStep2 = async (req: Request, res: Response) => {
  try {
    // 1️⃣ Validate body
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const { otp } = parsed.data;

    // 2️⃣ Extract temp token
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing temp token" });
    }

    const tempToken = header.split(" ")[1];

    // 3️⃣ Verify temp token safely
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET!);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return res.status(401).json({
          message: "OTP session expired. Please login again.",
        });
      }
      if (err instanceof JsonWebTokenError) {
        return res.status(401).json({
          message: "Invalid authentication token.",
        });
      }
      throw err;
    }

    if (decoded.purpose !== "ADMIN_OTP") {
      return res.status(403).json({ message: "Invalid token scope" });
    }

    const userId = decoded.userId;

    // 4️⃣ Fetch OTP record (DO NOT query by code)
    const record = await prisma.adminOtp.findFirst({
      where: { userId },
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // 5️⃣ Expiry check
    if (record.expiresAt < new Date()) {
      await prisma.adminOtp.delete({ where: { id: record.id } });
      return res.status(400).json({ message: "OTP expired" });
    }

    // 6️⃣ Attempt limiting
    if (record.attempts >= 5) {
      await prisma.adminOtp.delete({ where: { id: record.id } });
      return res.status(429).json({
        message: "Too many invalid attempts. Please login again.",
      });
    }

    // 7️⃣ OTP comparison
    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      await prisma.adminOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // 8️⃣ Consume OTP
    await prisma.adminOtp.delete({ where: { id: record.id } });

    // 9️⃣ Issue access token (short-lived)
    const accessToken = jwt.sign(
      {
        sub: userId,
        role: "SCHOOL_ADMIN",
        mfa: true,
        type: "ACCESS",
      },
      process.env.JWT_SECRET!,
      { expiresIn: "15m" }
    );

    return res.status(200).json({
      message: "Login successful",
      token: accessToken,
    });
  } catch (err) {
    console.error("Admin OTP verification error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
