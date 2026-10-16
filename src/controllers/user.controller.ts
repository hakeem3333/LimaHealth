import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware";
import prisma from "../services/prisma.service";
import type { User } from "../types/models";
import bcrypt from "bcryptjs";
import { z } from "zod";
import fs from "fs";
import path from "path";
import multer from "multer";

const pushTokenSchema = z.object({
  pushToken: z.string().min(1, "pushToken is required"),
});

const PROFILE_IMAGE_DIR = path.join("uploads", "profile-images");
if (!fs.existsSync(PROFILE_IMAGE_DIR)) fs.mkdirSync(PROFILE_IMAGE_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const profileImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PROFILE_IMAGE_DIR),
  filename: (req, file, cb) => {
    const userId = (req as AuthRequest).user!.id;
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

export const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      const err: any = new Error("Only JPEG, PNG, or WEBP images are allowed");
      err.status = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
}).single("image");

const saltRounds = 10;

// Zod schemas for input validation
const createUserSchema = z.object({
  orgId: z.string().uuid(),
  roleId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const updateUserSchema = z.object({
  orgId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

/**
 * Retrieves users within the caller's organisation, optionally filtered by role.
 */
export const getAllUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.user!.orgId;
    if (!orgId) {
      res.status(403).json({ error: "No organisation context" });
      return;
    }

    const role = typeof req.query.role === "string" ? req.query.role : undefined;

    const users = await prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        ...(role ? { role: { name: role } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    });

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single user by ID.
 */
export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        org: true,
        role: true,
        biometricLogs: true,
        moodLogs: true,
        alertsAsStudent: true,
        alertsAsCounselor: true,
        parentOf: true,
        studentOf: true,
        consent: true,
        // passwordHash intentionally excluded — never return credential
        // material, even to a Super Admin caller.
      },
    });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates a new user.
 */
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(parsed.password, saltRounds);
    const newUser: User = await prisma.user.create({
      data: {
        ...parsed,
        passwordHash,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates an existing user by ID.
 */
export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const parsed = updateUserSchema.parse(req.body);
    const updateData: any = { ...parsed };

    if (parsed.password) {
      updateData.passwordHash = await bcrypt.hash(parsed.password, saltRounds);
      delete updateData.password;
    }

    const updatedUser: User = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Registers (or clears, when omitted) the caller's own Expo push token.
 * Self-service only — always acts on the authenticated user, never a
 * caller-supplied ID.
 */
export const registerPushToken = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  try {
    const parsed = pushTokenSchema.parse(req.body);
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: parsed.pushToken },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    console.error("Error registering push token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Uploads (or replaces) the caller's own profile image.
 * Self-service only — always acts on the authenticated user.
 */
export const updateProfileImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  try {
    if (!req.file) {
      res.status(400).json({ message: "No image uploaded" });
      return;
    }

    const previous = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    const profileImage = `/uploads/profile-images/${req.file.filename}`;
    await prisma.user.update({
      where: { id: userId },
      data: { profileImage },
    });

    if (previous?.profileImage) {
      fs.unlink(path.join(process.cwd(), previous.profileImage), () => {});
    }

    res.status(200).json({ success: true, profileImage });
  } catch (error) {
    console.error("Error updating profile image:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Removes the caller's own profile image, reverting to initials.
 */
export const deleteProfileImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { profileImage: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { profileImage: null },
    });

    if (existing?.profileImage) {
      fs.unlink(path.join(process.cwd(), existing.profileImage), () => {});
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error removing profile image:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Deletes a user by ID.
 */
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /users/me/counselor
 * Returns the caller's own assigned counselor, if any — lets the mobile app
 * show "who's my care provider" without a caseload-scoped admin endpoint.
 */
export const getMyCounselor = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        assignedCounselor: {
          select: { id: true, firstName: true, lastName: true, email: true, profileImage: true },
        },
      },
    });
    res.status(200).json({ counselor: user?.assignedCounselor ?? null });
  } catch (error) {
    console.error("Error fetching assigned counselor:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
