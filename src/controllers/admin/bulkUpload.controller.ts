// Updated bulk upload controller
import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth.middleware";
import multer from "multer";
import fs from "fs/promises";
import fsSync from "fs";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import prisma from "../../services/prisma.service";
import { z } from "zod";
import { Parser } from "json2csv";
import { sendWelcomeEmail } from "../../services/email.service";
import crypto from "crypto";

// Ensure upload directory exists
if (!fsSync.existsSync("uploads")) fsSync.mkdirSync("uploads");

// Multer Upload Config
const upload = multer({ dest: "uploads/" });
export const uploadCSV = upload.single("file");

// Zod Schemas
const userSchema = z.object({
  firstName: z.string().min(1, "Missing first name"),
  lastName: z.string().min(1, "Missing last name"),
  email: z.string().email("Invalid email"),
  password: z.string().optional(),
  role: z.enum(["STUDENT", "TEACHER", "COUNSELOR"], {
    required_error: "Role is required",
    invalid_type_error: "Role must be STUDENT, TEACHER, or COUNSELOR",
  }),
});

const bulkUploadRequestSchema = z.object({
  user: z.object({
    id: z.string().min(1, "Missing admin ID"),
    schoolId: z.string().min(1, "Missing school context"),
    role: z.string(),
  }),
  file: z
    .object({
      path: z.string(),
      originalname: z.string(),
      mimetype: z.string().regex(/csv|excel|text\/plain/, {
        message: "Invalid file type. Must be CSV",
      }),
    })
    .optional(),
});

let lastFailedRecords: any[] = [];

export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  let filePath: string | null = null;

  try {
    if (!req.user || !["ADMIN", "SUPERADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const parsedRequest = bulkUploadRequestSchema.safeParse({
      user: req.user,
      file: req.file,
    });

    if (!parsedRequest.success) {
      return res.status(400).json({
        message: "Invalid upload request",
        errors: parsedRequest.error.flatten().fieldErrors,
      });
    }

    const { user, file } = parsedRequest.data;

    if (!file) {
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const { id: adminId, schoolId } = user;

    filePath = file.path;
    const usersSummary: any[] = [];
    const failedRecords: any[] = [];
    let createdCount = 0;

    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    for (const record of records) {
      const parsed = userSchema.safeParse(record);

      if (!parsed.success) {
        const errMsg = parsed.error.issues.map((i) => i.message).join(", ");
        failedRecords.push({ ...record, error: errMsg });
        usersSummary.push({
          email: record.email || "(no email)",
          status: "❌ Validation failed",
        });
        continue;
      }

      const { firstName, lastName, email, password, role } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        failedRecords.push({ ...record, error: "User already exists" });
        usersSummary.push({ email, status: "⚠️ Already exists" });
        continue;
      }

      const tempPassword = password || crypto.randomBytes(6).toString("base64");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

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

        sendWelcomeEmail({
          to: email,
          name: `${firstName} ${lastName}`,
          role,
          password: tempPassword,
        }).catch((err) =>
          console.error("Welcome email failed for", email, err)
        );
      } catch (err: any) {
        failedRecords.push({ ...record, error: err.message });
        usersSummary.push({ email, role, status: "❌ Creation failed" });
      }
    }

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

    lastFailedRecords = failedRecords;

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
  } finally {
    if (filePath) await fs.unlink(filePath).catch(() => {});
  }
};

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
