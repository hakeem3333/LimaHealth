import { PrismaClient } from "@prisma/client";
/**
 * A singleton instance of the PrismaClient.
 * This ensures that a single, reusable instance is available
 * throughout the application's lifecycle.
 */
declare const prisma: PrismaClient<import("@prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export default prisma;
//# sourceMappingURL=prisma.service.d.ts.map