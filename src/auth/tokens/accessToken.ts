import jwt from "jsonwebtoken";
import { User } from "@prisma/client";

export const generateAccessToken = (user: User) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" }
  );
};
