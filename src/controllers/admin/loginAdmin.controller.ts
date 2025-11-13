import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../services/prisma.service";
import { sendEmail } from "../../services/email.service"; // your mailer

export const adminLoginStep1 = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.role !== "ADMIN")
      return res.status(403).json({ message: "Not authorized" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    // generate 6 digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.adminOtp.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      },
    });
    console.log("Print User Email @LogIn: ", user.email);
    await sendEmail({
      to: user.email,
      subject: "Your admin login code",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    // short-lived temp token
    const tempToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "10m",
    });

    return res.json({
      message: "OTP sent to email",
      tempToken,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Problem with sending email. Please try again soon" });
  }
};
