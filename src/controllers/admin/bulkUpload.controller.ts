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

if (!fsSync.existsSync("uploads")) fsSync.mkdirSync("uploads");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
});
export const uploadCSV = upload.single("file");

const userSchema = z.object({
  firstName: z.string().min(1, "Missing first name"),
  lastName: z.string().min(1, "Missing last name"),
  email: z.string().email("Invalid email"),
  role: z.enum(["STUDENT", "TEACHER", "COUNSELOR"]),
});

export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  let filePath: string | null = null;

  try {
    // 1. Authorization Check
    if (!req.user || !["SCHOOL_ADMIN", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!req.file)
      return res.status(400).json({ message: "No CSV file uploaded" });

    const { id: adminId, schoolId } = req.user;
    filePath = req.file.path;

    // 2. Parse CSV
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const failedRecords: any[] = [];
    const successPayloads: any[] = [];
    const emailPromises: Promise<any>[] = [];

    // 3. Validation Loop (No DB writes here)
    for (const record of records) {
      const parsed = userSchema.safeParse(record);
      if (!parsed.success) {
        failedRecords.push({
          ...record,
          error: parsed.error.issues[0].message,
        });
        continue;
      }

      const tempPassword = crypto.randomBytes(6).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      successPayloads.push({
        ...parsed.data,
        passwordHash,
        schoolId,
        tempPassword, // kept temporarily for the email
      });
    }

    // 4. Batch Create (Much Faster)
    // We use createMany but filter out existing emails first
    const emails = successPayloads.map((u) => u.email);
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const finalUsersToCreate = successPayloads.filter(
      (u) => !existingEmails.has(u.email),
    );

    // Track duplicates as failed
    successPayloads.forEach((u) => {
      if (existingEmails.has(u.email))
        failedRecords.push({ ...u, error: "User already exists" });
    });

    if (finalUsersToCreate.length > 0) {
      await prisma.user.createMany({
        data: finalUsersToCreate.map(
          ({ tempPassword, ...userData }) => userData,
        ),
        skipDuplicates: true,
      });

      // 5. Trigger Emails (Don't await them one-by-one)
      finalUsersToCreate.forEach((u) => {
        emailPromises.push(
          sendWelcomeEmail({
            to: u.email,
            name: `${u.firstName} ${u.lastName}`,
            role: u.role,
            password: u.tempPassword,
          }),
        );
      });
    }

    // 6. Log the action
    const log = await prisma.bulkUploadLog.create({
      data: {
        adminId,
        schoolId,
        totalRecords: records.length,
        createdCount: finalUsersToCreate.length,
        failedCount: failedRecords.length,
        // Store errors in DB instead of global variable!
        errorData: JSON.stringify(failedRecords),
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

  const log = await prisma.bulkUploadLog.findUnique({
    where: { id: logId },
  });

  if (!log || !log.errorData)
    return res.status(404).json({ message: "No report found" });

  const failedRecords = JSON.parse(log.errorData as string);
  const parser = new Parser();
  const csv = parser.parse(failedRecords);

  res.header("Content-Type", "text/csv");
  res.attachment(`failed_upload_${logId}.csv`);
  return res.send(csv);
};
