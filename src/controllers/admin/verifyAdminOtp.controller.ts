import type { Request, Response } from "express";
import prisma from "../../services/prisma.service";
import jwt from "jsonwebtoken";

export const adminLoginStep2 = async (req: Request, res: Response) => {
  try {
    const { otp } = req.body;
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ message: "Missing temp token" });

    const tempToken = header.split(" ")[1];
    const decoded: any = jwt.verify(tempToken, process.env.JWT_SECRET!);
    const userId = decoded.userId;

    const record = await prisma.adminOtp.findFirst({
      where: { userId, code: otp },
    });

    if (!record) return res.status(400).json({ message: "Invalid OTP" });

    if (record.expiresAt < new Date())
      return res.status(400).json({ message: "OTP expired" });

    // DELETE used OTP
    await prisma.adminOtp.delete({ where: { id: record.id } });

    // issue full access token
    const accessToken = jwt.sign(
      { id: userId, role: "ADMIN" },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful",
      token: accessToken,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
