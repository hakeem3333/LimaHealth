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
import { resolveRoleAlias, acceptedRoleValuesDescription, getOrgRoleLabels } from "../../utils/orgRoleAliases";

if (!fsSync.existsSync("uploads")) fsSync.mkdirSync("uploads");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — matches the frontend's stated limit
});

export const uploadFile = upload.single("file");

const baseRowSchema = z.object({
  firstName: z.string().min(1, "Missing first name"),
  lastName: z.string().min(1, "Missing last name"),
  email: z.string().email("Invalid email"),
  role: z.string().min(1, "Missing role"),
});

export const bulkUploadUsers = async (req: AuthRequest, res: Response) => {
  let filePath: string | null = null;

  try {
    if (!req.user || !["ORG_ADMIN", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { id: adminId, orgId } = req.user;
    const isDryRun = req.body?.dryRun === "true" || req.query?.dryRun === "true";
    filePath = req.file.path;
    const fileName = req.file.originalname.toLowerCase();

    const org = await prisma.organisation.findUnique({
      where: { id: orgId! },
      select: { orgType: true },
    });
    const roleDescription = acceptedRoleValuesDescription(org?.orgType);

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

    // 2. Fetch Role IDs for the two underlying role tiers
    const dbRoles = await prisma.role.findMany({
      where: { name: { in: ["STUDENT", "COUNSELOR"] } },
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

    // 3. Validation & Mapping — role column accepts the org's own vocabulary
    for (const record of records) {
      const parsed = baseRowSchema.safeParse(record);
      if (!parsed.success) {
        failedRecords.push({
          ...record,
          error: parsed.error.issues[0].message,
        });
        continue;
      }

      const resolvedRole = resolveRoleAlias(org?.orgType, parsed.data.role);
      if (!resolvedRole) {
        failedRecords.push({
          ...record,
          error: `Unrecognized role "${parsed.data.role}". Expected ${roleDescription}.`,
        });
        continue;
      }

      const roleId = roleMap[resolvedRole];
      if (!roleId) {
        failedRecords.push({
          ...record,
          error: `Role ${resolvedRole} is not configured for this platform`,
        });
        continue;
      }

      const tempPassword = crypto.randomBytes(6).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      successPayloads.push({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        roleId,
        originalRoleName: resolvedRole,
        rawRoleValue: parsed.data.role,
        passwordHash,
        orgId,
        tempPassword,
        mustChangePassword: true,
      });
    }

    // 4. Filter duplicates
    const emails = successPayloads.map((u) => u.email);
    const existingUsers = emails.length
      ? await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [];
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const finalUsersToCreate = successPayloads.filter(
      (u) => !existingEmails.has(u.email),
    );

    successPayloads.forEach((u) => {
      if (existingEmails.has(u.email)) {
        failedRecords.push({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.rawRoleValue,
          error: "User already exists",
        });
      }
    });

    // 5. Dry run — validate only, never write, never email, never log
    if (isDryRun) {
      return res.status(200).json({
        preview: true,
        totalRecords: records.length,
        wouldCreateCount: finalUsersToCreate.length,
        wouldFailCount: failedRecords.length,
        acceptedRoleValues: roleDescription,
        sampleValid: finalUsersToCreate.slice(0, 5).map((u) => ({
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.rawRoleValue,
          resolvedRole: u.originalRoleName,
        })),
        sampleInvalid: failedRecords.slice(0, 10),
      });
    }

    // 6. Batch Insert
    if (finalUsersToCreate.length > 0) {
      await prisma.user.createMany({
        data: finalUsersToCreate.map(
          ({ tempPassword, originalRoleName, rawRoleValue, ...userData }) => userData,
        ),
        skipDuplicates: true,
      });

      // 7. Background Emails
      finalUsersToCreate.forEach((u) => {
        sendWelcomeEmail({
          to: u.email,
          name: `${u.firstName} ${u.lastName}`,
          role: u.originalRoleName,
          password: u.tempPassword,
        }).catch((err) => console.error("Email failed:", u.email, err));
      });
    }

    // 8. Log with errorData
    const log = await prisma.bulkUploadLog.create({
      data: {
        adminId,
        orgId: orgId!,
        totalRecords: records.length,
        createdCount: finalUsersToCreate.length,
        failedCount: failedRecords.length,
        errorData: failedRecords.length > 0 ? failedRecords : undefined,
      },
    });

    return res.status(200).json({
      message: "Bulk upload completed",
      logId: log.id,
      createdCount: finalUsersToCreate.length,
      failedCount: failedRecords.length,
      failedDownload: failedRecords.length > 0 ? `/failed-csv/${log.id}` : null,
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

  const failedRecords = Array.isArray(log.errorData) ? log.errorData : [];

  const parser = new Parser();
  const csv = parser.parse(failedRecords);

  res.header("Content-Type", "text/csv");
  res.attachment(`failed_upload_${logId}.csv`);
  return res.send(csv);
};

/**
 * GET /auth/upload/template
 * Downloadable XLSX template pre-filled with headers and example rows
 * using the requesting organisation's own role vocabulary.
 */
export const downloadEnrollmentTemplate = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !["ORG_ADMIN", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const org = await prisma.organisation.findUnique({
      where: { id: req.user.orgId! },
      select: { orgType: true },
    });
    const labels = getOrgRoleLabels(org?.orgType);

    const rows = [
      { firstName: "Jane", lastName: "Doe", email: "jane.doe@example.com", role: labels.member },
      { firstName: "John", lastName: "Smith", email: "john.smith@example.com", role: labels.support },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", "attachment; filename=enrollment-template.xlsx");
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
