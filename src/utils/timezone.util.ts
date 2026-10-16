// Wall-clock helpers for IANA time zones, built on Intl so no tz library is
// needed. Counselor working hours are stored as "HH:mm" in the counselor's
// own zone; these convert between that and absolute instants.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type ZonedParts = { ymd: string; hhmm: string; dayOfWeek: number; year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zonedParts(date: Date, tz: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const { type, value } of formatterFor(tz).formatToParts(date)) p[type] = value;
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  const hour = Number(p.hour), minute = Number(p.minute), second = Number(p.second);
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${p.hour}:${p.minute}`,
    dayOfWeek: WEEKDAYS[p.weekday ?? ""] ?? 0,
    year, month, day, hour, minute, second,
  };
}

// Offset of `tz` from UTC at the given instant, in ms (positive east of UTC).
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant at which the clock in `tz` reads `ymd` `hhmm`.
export function zonedWallTimeToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes so a DST change between the guess and the answer settles.
  let result = guess - offsetMs(new Date(guess), tz);
  result = guess - offsetMs(new Date(result), tz);
  return new Date(result);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
