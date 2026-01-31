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
import XLSX from "xlsx";
import crypto from "crypto";
import { sendWelcomeEmail } from "../../services/email.service";

if (!fsSync.existsSync("uploads")) fsSync.mkdirSync("uploads");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
});

export const uploadFile = upload.single("file");

const userSchema = z.object({
  firstName: z.string().min(1, "Missing first name"),
  lastName: z.string().min(1, "Missing last name"),
  email: z.string().email("Invalid email"),
  role: z.enum(["STUDENT", "TEACHER", "COUNSELOR"]),
});

export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  let filePath: string | null = null;

  try {
    if (!req.user || !["SCHOOL_ADMIN", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { id: adminId, schoolId } = req.user;
    filePath = req.file.path;
    const fileName = req.file.originalname.toLowerCase();

    let records: any[] = [];

    // 1. Parsing
    if (fileName.endsWith(".csv")) {
      const fileContent = await fs.readFile(filePath, "utf-8");
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ message: "Unsupported file format." });
    }

    // 2. Fetch Role IDs
    const dbRoles = await prisma.role.findMany({
      where: { name: { in: ["STUDENT", "TEACHER", "COUNSELOR"] } },
    });

    const roleMap = dbRoles.reduce(
      (acc, r) => {
        acc[r.name] = r.id;
        return acc;
      },
      {} as Record<string, string>,
    );

    const failedRecords: any[] = [];
    const successPayloads: any[] = [];

    // 3. Validation & Mapping
    for (const record of records) {
      const parsed = userSchema.safeParse(record);
      if (!parsed.success) {
        failedRecords.push({
          ...record,
          error: parsed.error.issues[0].message,
        });
        continue;
      }

      const roleId = roleMap[parsed.data.role];
      if (!roleId) {
        failedRecords.push({
          ...record,
          error: `Role ${parsed.data.role} does not exist in DB`,
        });
        continue;
      }

      const tempPassword = crypto.randomBytes(6).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      successPayloads.push({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        roleId: roleId,
        originalRoleName: parsed.data.role,
        passwordHash,
        schoolId,
        tempPassword,
      });
    }

    // 4. Filter duplicates
    const emails = successPayloads.map((u) => u.email);
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const finalUsersToCreate = successPayloads.filter(
      (u) => !existingEmails.has(u.email),
    );

    // Track existing users as failures
    successPayloads.forEach((u) => {
      if (existingEmails.has(u.email)) {
        failedRecords.push({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.originalRoleName,
          error: "User already exists",
        });
      }
    });

    // 5. Batch Insert
    if (finalUsersToCreate.length > 0) {
      await prisma.user.createMany({
        data: finalUsersToCreate.map(
          ({ tempPassword, originalRoleName, ...userData }) => userData,
        ),
        skipDuplicates: true,
      });

      // 6. Background Emails
      finalUsersToCreate.forEach((u) => {
        sendWelcomeEmail({
          to: u.email,
          name: `${u.firstName} ${u.lastName}`,
          role: u.originalRoleName,
          password: u.tempPassword,
        }).catch((err) => console.error("Email failed:", u.email, err));
      });
    }

    // 7. Log with errorData
    const log = await prisma.bulkUploadLog.create({
      data: {
        adminId,
        schoolId: schoolId!,
        totalRecords: records.length,
        createdCount: finalUsersToCreate.length,
        failedCount: failedRecords.length,
        // Store as JSON for the CSV downloader
        errorData: failedRecords.length > 0 ? failedRecords : undefined,
      },
    });

    return res.status(200).json({
      message: "Bulk upload completed",
      logId: log.id,
      createdCount: finalUsersToCreate.length,
      failedCount: failedRecords.length,
      failedDownload:
        failedRecords.length > 0
          ? `/api/v1/admin/setup/bulk-upload/failed-csv/${log.id}`
          : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (filePath) await fs.unlink(filePath).catch(() => {});
  }
};

export const getFailedCSV = async (req: AuthRequest, res: Response) => {
  const { logId } = req.params;
  const log = await prisma.bulkUploadLog.findUnique({ where: { id: logId } });

  if (!log || !log.errorData) {
    return res.status(404).json({ message: "No failure report found" });
  }

  // Prisma returns Json types directly, no need to JSON.parse if it's already an object
  const failedRecords = Array.isArray(log.errorData) ? log.errorData : [];

  const parser = new Parser();
  const csv = parser.parse(failedRecords);

  res.header("Content-Type", "text/csv");
  res.attachment(`failed_upload_${logId}.csv`);
  return res.send(csv);
};
