import { PrismaClient } from "@prisma/client";

/**
 * A singleton instance of the PrismaClient.
 * This ensures that a single, reusable instance is available
 * throughout the application's lifecycle.
 */
const prisma = new PrismaClient();

export default prisma;
