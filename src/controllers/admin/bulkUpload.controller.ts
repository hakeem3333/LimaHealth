import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth.middleware";
import multer from "multer";
import fs from "fs/promises";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import { z } from "zod";
import { Parser } from "json2csv";
import { sendWelcomeEmail } from "../../services/email.service";

// ✅ Multer for temporary upload
const upload = multer({ dest: "uploads/" });
export const uploadCSV = upload.single("file");

// ✅ Zod validation schema
const userSchema = z.object({
  firstName: z.string().min(1, "Missing first name"),
  lastName: z.string().min(1, "Missing last name"),
  email: z.string().email("Invalid email"),
  password: z.string().optional(),
  role: z.enum(["STUDENT", "TEACHER", "COUNSELOR"], {
    required_error: "Role required",
  }),
});

// ✅ In-memory cache for failed entries
let lastFailedRecords: any[] = [];

/**
 * Admin bulk upload users (students/teachers/counsellors)
 */
export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const schoolId = req.user?.schoolId;
  if (!schoolId) return res.status(403).json({ message: "No school context" });

  if (!req.file)
    return res.status(400).json({ message: "No CSV file uploaded" });

  const filePath = req.file.path;
  const usersSummary: any[] = [];
  const failedRecords: any[] = [];
  let createdCount = 0;

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    for (const record of records) {
      const parsed = userSchema.safeParse(record);
      if (!parsed.success) {
        failedRecords.push({
          ...record,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        });
        usersSummary.push({
          email: record.email || "(no email)",
          status: "❌ Validation failed",
        });
        continue;
      }

      const { firstName, lastName, email, password, role } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        usersSummary.push({ email, status: "⚠️ Already exists" });
        continue;
      }

      const passwordHash = await bcrypt.hash(password || "Password123!", 10);

      try {
        await prisma.user.create({
          data: {
            firstName,
            lastName,
            email,
            passwordHash,
            role,
            schoolId,
          },
        });

        createdCount++;
        usersSummary.push({ email, role, status: "✅ Created" });

        // Send welcome email (non-blocking)
        sendWelcomeEmail({
          to: email,
          name: `${firstName} ${lastName}`,
          role,
          password: password || "Password123!",
        }).catch((err) =>
          console.error("Welcome email failed for", email, err)
        );
      } catch (err: any) {
        failedRecords.push({ ...record, error: err.message });
        usersSummary.push({ email, role, status: "❌ Creation failed" });
      }
    }

    // ✅ Save upload log
    await prisma.bulkUploadLog.create({
      data: {
        adminId,
        schoolId,
        totalRecords: usersSummary.length,
        createdCount,
        failedCount: failedRecords.length,
        createdAt: new Date(),
      },
    });

    // ✅ Cache failed records for CSV download
    lastFailedRecords = failedRecords;

    // ✅ Clean up file
    await fs.unlink(filePath);

    return res.status(200).json({
      message: "Bulk upload completed",
      createdCount,
      failedCount: failedRecords.length,
      summary: usersSummary,
      failedDownload:
        failedRecords.length > 0
          ? "/api/v1/admin/setup/bulk-upload/failed-csv"
          : null,
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    return res.status(500).json({ message: "Server error during upload" });
  }
};

/**
 * Download failed entries as CSV
 */
export const getFailedCSV = async (_req: AuthRequest, res: Response) => {
  try {
    if (lastFailedRecords.length === 0)
      return res.status(404).json({ message: "No failed records available" });

    const parser = new Parser();
    const csv = parser.parse(lastFailedRecords);
    res.header("Content-Type", "text/csv");
    res.attachment("failed_uploads.csv");
    return res.send(csv);
  } catch (err) {
    console.error("Failed CSV generation error:", err);
    return res.status(500).json({ message: "Could not generate CSV" });
  }
};
