// import { Request, Response } from "express";
// import prisma from "../services/prisma.service";
// import bcrypt from "bcrypt";
// import jwt from "jsonwebtoken";
// import { z } from "zod";

// // Zod schema for login validation
// const loginSchema = z.object({
//   email: z.string().email(),
//   password: z.string().min(6),
// });

// /**
//  * Login for all user roles (student, counselor, admin, parent)
//  */
// export const login = async (req: Request, res: Response) => {
//   try {
//     const { email, password } = loginSchema.parse(req.body);

//     // Find user by email
//     const user = await prisma.user.findUnique({
//       where: { email },
//       include: {
//         role: true,
//         school: true,
//       },
//     });

//     if (!user) {
//       return res.status(401).json({ error: "Invalid email or password" });
//     }

//     // Compare password
//     const validPassword = await bcrypt.compare(password, user.passwordHash);
//     if (!validPassword) {
//       return res.status(401).json({ error: "Invalid email or password" });
//     }

//     // Generate JWT
//     const token = jwt.sign(
//       {
//         id: user.id,
//         role: user.role.name, // STUDENT | COUNSELOR | ADMIN | PARENT
//         schoolId: user.schoolId,
//       },
//       process.env.JWT_SECRET as string,
//       { expiresIn: "7d" }
//     );

//     // Success response
//     return res.status(200).json({
//       message: "Login successful",
//       token,
//       user: {
//         id: user.id,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         role: user.role.name,
//         email: user.email,
//       },
//     });
//   } catch (error) {
//     if (error instanceof z.ZodError) {
//       return res.status(400).json({ errors: error.errors });
//     }

//     console.error("Login error:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../../services/prisma.service";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }, // so we return role.name
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Only allow counsellor, student, parent to login
    const allowedRoles = ["COUNSELLOR", "STUDENT", "PARENT"];
    if (!allowedRoles.includes(user.role?.name ?? "")) {
      return res.status(403).json({
        message: "Account type not allowed to login here",
      });
    }

    // Generate Token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role?.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role?.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
