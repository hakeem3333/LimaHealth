export const ADULT_AGE = 18;
const MAX_PLAUSIBLE_AGE = 120;

export function calculateAge(dob: Date | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** Anyone born on or before this date is an adult today; anyone born after it is a minor. */
export function adultCutoffDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - ADULT_AGE, now.getUTCMonth(), now.getUTCDate()));
}

/** true = under 18, false = adult, null = date of birth unknown */
export function isMinor(dob: Date | null | undefined): boolean | null {
  const age = calculateAge(dob);
  return age === null ? null : age < ADULT_AGE;
}

export function formatDateOfBirth(dob: Date | null | undefined): string | null {
  return dob ? dob.toISOString().slice(0, 10) : null;
}

/**
 * Accepts "YYYY-MM-DD", a Date, or an Excel serial number (what XLSX yields for
 * date cells). Empty values mean "not provided" and return null. Throws an Error
 * with a user-facing message when the value is present but unusable.
 */
export function parseDateOfBirth(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  let date: Date;

  if (value instanceof Date) {
    date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  } else if (typeof value === "number") {
    // Excel serial day count, epoch 1899-12-30
    date = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error("dateOfBirth must be a valid date in YYYY-MM-DD format");
    }
    date = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
      throw new Error("dateOfBirth must be a valid date in YYYY-MM-DD format");
    }
  } else {
    throw new Error("dateOfBirth must be a valid date in YYYY-MM-DD format");
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error("dateOfBirth must be a valid date in YYYY-MM-DD format");
  }
  if (date.getTime() > Date.now()) {
    throw new Error("dateOfBirth cannot be in the future");
  }
  const age = calculateAge(date);
  if (age === null || age > MAX_PLAUSIBLE_AGE) {
    throw new Error("dateOfBirth is not a plausible date");
  }

  return date;
}
