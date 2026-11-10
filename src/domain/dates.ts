// Calendar dates, with no time and no time zone: "2026-10-28".
// A day runs from 00:00 to 23:59 in the device's local time, and the domain never reads the
// clock: "today" is always passed in.

/** A valid calendar date in `YYYY-MM-DD` format. Dates compare correctly as strings. */
export type LocalDate = string & { readonly __brand: "LocalDate" };

/** Day of the week, starting on Monday (ISO order): 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

// Dates are handled as UTC instants only to do calendar arithmetic without time zones or
// daylight saving time getting in the way.
function toUtcMs(date: LocalDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromParts(year: number, month: number, day: number): LocalDate {
  const pad = (n: number, length: number) => String(n).padStart(length, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;
}

/** Returns the date if `text` is a real calendar date in `YYYY-MM-DD` format, or null. */
export function parseLocalDate(text: string): LocalDate | null {
  const match = FORMAT.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls over impossible dates (February 30 becomes March 2): reject them.
  const isReal =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day;
  return isReal ? (text as LocalDate) : null;
}

/** Like `parseLocalDate`, but throws on an invalid date. For literals known to be valid. */
export function localDate(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (date === null) throw new RangeError(`Invalid local date: "${text}"`);
  return date;
}

/** The calendar date that `instant` falls on in the device's local time. */
export function localDateOf(instant: Date): LocalDate {
  return fromParts(
    instant.getFullYear(),
    instant.getMonth() + 1,
    instant.getDate(),
  );
}

export function weekdayOf(date: LocalDate): Weekday {
  // getUTCDay() starts on Sunday (0); shift it so that Monday is 0.
  return ((new Date(toUtcMs(date)).getUTCDay() + 6) % 7) as Weekday;
}

/** Adds `days` (negative to go back) to a date. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const instant = new Date(toUtcMs(date) + days * MS_PER_DAY);
  return fromParts(
    instant.getUTCFullYear(),
    instant.getUTCMonth() + 1,
    instant.getUTCDate(),
  );
}
