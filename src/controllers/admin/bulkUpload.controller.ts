import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth.middleware";
import multer from "multer";
import fs from "fs";
import { parse } from "csv-parse";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";

// Configure multer for temporary storage
const upload = multer({ dest: "uploads/" });

// Export for route usage
export const uploadCSV = upload.single("file");

/**
 * Admin bulk upload endpoint (handles mixed roles)
 */
export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(403).json({ message: "No school context" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const filePath = req.file.path;
    const usersSummary: any[] = [];

    const fileContent = fs.readFileSync(filePath);
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    for await (const record of records) {
      const { firstName, lastName, email, password, role } = record;

      // Validate required fields
      if (!firstName || !lastName || !email || !role) {
        usersSummary.push({ email, status: "❌ Missing required fields" });
        continue;
      }

      const normalizedRole = role.trim().toUpperCase();
      if (!["STUDENT", "TEACHER", "COUNSELOR"].includes(normalizedRole)) {
        usersSummary.push({ email, status: `❌ Invalid role: ${role}` });
        continue;
      }

      // Check duplicates
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        usersSummary.push({ email, status: "⚠️ Already exists" });
        continue;
      }

      // Hash password or default
      const passwordHash = await bcrypt.hash(password || "Password123!", 10);

      try {
        await prisma.user.create({
          data: {
            firstName,
            lastName,
            email,
            passwordHash,
            role: normalizedRole,
            schoolId,
          },
        });

        usersSummary.push({
          email,
          role: normalizedRole,
          status: "✅ Created",
        });
      } catch (err) {
        usersSummary.push({
          email,
          role: normalizedRole,
          status: "❌ Failed",
          error: (err as Error).message,
        });
      }
    }

    fs.unlinkSync(filePath); // cleanup temporary file

    return res.status(200).json({
      message: "Bulk upload completed",
      results: usersSummary,
    });
  } catch (err) {
    console.error("Error in bulkUploadUsers:", err);
    res.status(500).json({ message: "Server error during CSV upload" });
  }
};
