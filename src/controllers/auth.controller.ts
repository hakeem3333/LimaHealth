import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "../services/email.service";
import { v4 as uuidv4 } from "uuid";
import { SchoolStatus } from "@prisma/client";

export const schoolSignup = async (req: Request, res: Response) => {
  try {
    const { name, contact_email, password } = req.body;

    if (!name || !contact_email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Check duplicate school
    const existingSchool = await prisma.school.findUnique({
      where: { contact_email },
    });

    if (existingSchool) {
      return res
        .status(409)
        .json({ message: "A school with this email already exists" });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create school (status defaults to PENDING_EMAIL_VERIFICATION)
    const school = await prisma.school.create({
      data: {
        name,
        contact_email,
      },
    });

    // ✅ Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: contact_email,
        password: hashedPassword,
        role: "ADMIN",
        schoolId: school.id,
      },
    });

    // ✅ Generate verification token
    const token = uuidv4();

    await prisma.emailVerificationToken.create({
      data: {
        schoolId: school.id,
        token,
      },
    });

    // ✅ Send email (DEV returns preview link)
    const result = await sendVerificationEmail(contact_email, token);

    // ✅ Base response
    const responsePayload: any = {
      message: "Signup successful. Please verify your email.",
      schoolId: school.id,
      adminUserId: adminUser.id,
    };

    // ✅ Include preview only in non-production environment
    if (result?.preview) {
      responsePayload.previewLink = result.preview;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
