import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { sendVerificationEmail } from "../services/email.service";

export const schoolSignup = async (req: Request, res: Response) => {
  try {
    const { name, contact_email, password, website, firstName, lastName } =
      req.body;

    if (!name || !contact_email || !password || !firstName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Check duplicate school by email
    const existingSchool = await prisma.school.findUnique({
      where: { contact_email },
      include: { users: true },
    });

    if (existingSchool) {
      return res
        .status(409)
        .json({ message: "A school with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [school, adminUser] = await prisma.$transaction(async (tx) => {
      // ✅ Create school
      const school = await tx.school.create({
        data: {
          name,
          contact_email,
          website,
        },
      });

      // ✅ Create admin user
      const adminUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: contact_email,
          passwordHash: hashedPassword,
          role: "ADMIN", // ✅ Enum/string
          schoolId: school.id, // ✅ Link
        },
      });

      return [school, adminUser];
    });

    // ✅ Generate verification token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours

    await prisma.emailVerificationToken.create({
      data: {
        schoolId: school.id,
        token,
        expiresAt,
      },
    });

    // ✅ Send verification email
    const result = await sendVerificationEmail(contact_email, token);

    const responsePayload: any = {
      message: "Signup successful. Please verify your email.",
      schoolId: school.id,
      adminUserId: adminUser.id,
    };

    if (result?.preview) {
      responsePayload.previewLink = result.preview;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
