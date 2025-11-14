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

// =======================
// 🧩 Multer Upload Config
// =======================
const upload = multer({ dest: "uploads/" });
export const uploadCSV = upload.single("file");

// =======================
// 🧩 Zod Schemas
// =======================

// Schema for a single CSV row
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

// Schema for validating request context + file
const bulkUploadRequestSchema = z.object({
  user: z.object({
    id: z.string().optional(),
    schoolId: z.string().min(1, "Missing school context"),
  }),
  file: z
    .object({
      path: z.string(),
      originalname: z.string(),
      mimetype: z.string().regex(/^(text\/csv|application\/vnd\.ms-excel)$/, {
        message: "Invalid file type. Must be CSV",
      }),
    })
    .optional(), // <-- FIXED (was nullable)
});

// =======================
// 🧠 Failed record cache
// =======================
let lastFailedRecords: any[] = [];

// =======================
// 📦 Bulk Upload Controller
// =======================
export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  try {
    // DEBUG: See what Multer passed
    console.log("Received file:", req.file);

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

    const filePath = file.path;
    const usersSummary: any[] = [];
    const failedRecords: any[] = [];
    let createdCount = 0;

    // Read and parse CSV
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

      // Check if user exists
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

        // Send welcome email (fire-and-forget)
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

    // Log the upload attempt
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

    // Cleanup temp file
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

// =======================
// 💾 Download Failed CSV
// =======================
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
