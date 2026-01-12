// src/controllers/utils/dateRange.ts

/**
 * Converts a range string into a Date object.
 * Supported ranges:
 *  - 7d  → last 7 days
 *  - 30d → last 30 days
 *  - 90d → last 90 days
 *  - all → no limit (returns epoch)
 */
export function getDateFromRange(range: string): Date {
  const now = new Date();

  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    case "all":
      return new Date(0); // Unix epoch

    default:
      // fallback to 7 days
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}
