import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

import prisma from "../../services/prisma.service";
import { sendVerificationEmail } from "../../services/email.service";

// export const schoolSignup = async (req: Request, res: Response) => {
//   try {
//     const { name, contact_email, password, website, firstName, lastName } =
//       req.body;

//     // ✅ Validate required fields
//     if (!name || !contact_email || !password || !firstName || !lastName) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     // ✅ Check for duplicate school by email
//     const existingSchool = await prisma.school.findUnique({
//       where: { contact_email },
//       include: { users: true },
//     });

//     if (existingSchool) {
//       return res
//         .status(409)
//         .json({ message: "A school with this email already exists" });
//     }

//     // ✅ Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // ✅ Create school + admin user in a transaction
//     const [school, adminUser] = await prisma.$transaction(async (tx) => {
//       const school = await tx.school.create({
//         data: { name, contact_email, website },
//       });

//       const adminUser = await tx.user.create({
//         data: {
//           firstName,
//           lastName,
//           email: contact_email,
//           passwordHash: hashedPassword,
//           role: "ADMIN", // Enum/string for role
//           schoolId: school.id, // Link user to school
//         },
//       });

//       return [school, adminUser];
//     });

//     // ✅ Generate verification token (3 hours expiry)
//     const token = uuidv4();
//     const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

//     await prisma.emailVerificationToken.create({
//       data: { schoolId: school.id, token, expiresAt },
//     });

//     // ✅ Send verification email
//     const emailResult = await sendVerificationEmail(contact_email, token);

//     // ✅ Prepare response payload
//     const responsePayload: any = {
//       message: "Signup successful. Please verify your email.",
//       schoolId: school.id,
//       adminUserId: adminUser.id,
//     };

//     // Include clickable preview link in dev (smtp4dev)
//     if (emailResult?.verificationUrl) {
//       responsePayload.previewLink = emailResult.verificationUrl;
//     }

//     return res.status(201).json(responsePayload);
//   } catch (error) {
//     console.error("Error during signup:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const schoolSignup = async (req: Request, res: Response) => {
  try {
    const { name, contact_email, password, website, firstName, lastName } =
      req.body;

    if (!name || !contact_email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Before creating admin
    // ✅ Check if another admin already exists for this school
  const existingAdmin = await prisma.user.findFirst({
    where: {
    role: "ADMIN",
    school: {
      name,
    },
  },
  });

if (existingAdmin) {
  return res
    .status(400)
    .json({ message: "An admin already exists for this school" });
}


    const existingSchool = await prisma.school.findUnique({
      where: { contact_email },
    });

    if (existingSchool) {
      return res
        .status(409)
        .json({ message: "A school with this email already exists" });
    }

    // ✅ Check duplicate school name
    const existingByName = await prisma.school.findUnique({
      where: { name },
    });
    if (existingByName) {
      return res
        .status(409)
        .json({ message: "A school with this name already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Wrap everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1) Create school
      const school = await tx.school.create({
        data: { name, contact_email, website },
      });

      // 2) Create admin
      const adminUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: contact_email,
          passwordHash: hashedPassword,
          role: "ADMIN",
          schoolId: school.id,
        },
      });

      // 3) Create token
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);

      await tx.emailVerificationToken.create({
        data: { schoolId: school.id, token, expiresAt },
      });

      // 4) Try send email
      const emailResult = await sendVerificationEmail(contact_email, token);

      // ✅ If email fails → automatic rollback
      if (!emailResult) throw new Error("Failed to send verification email");

      return { school, adminUser, token, emailResult };
    });

    const { school, adminUser, emailResult } = result;

    return res.status(201).json({
      message: "Signup successful. Please verify your email.",
      schoolId: school.id,
      adminUserId: adminUser.id,
      previewLink: emailResult?.preview, // smtp4dev
    });
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({
      message: "Internal server error during signup",
    });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).send("Invalid token");
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record) {
      return res.status(404).send("Token not found or expired");
    }

    // Activate school
    await prisma.school.update({
      where: { id: record.schoolId },
      data: { status: "ACTIVE" },
    });

    // Optionally delete token
    await prisma.emailVerificationToken.delete({ where: { id: record.id } });

    res.send("Email verified successfully! Your school is now active.");
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).send("Internal server error");
  }
};