// Times of day, with minute precision and no time zone: "08:30".
// Like dates, they are local to the device and the domain never reads the clock.

import type { LocalDate } from "./dates";

/** A valid time of day in 24-hour `HH:MM` format. Times compare correctly as strings. */
export type LocalTime = string & { readonly __brand: "LocalTime" };

/** A minute of a calendar day, in the device's local time. */
export interface LocalDateTime {
  readonly date: LocalDate;
  readonly time: LocalTime;
}

const FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function fromMinutes(minutes: number): LocalTime {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${pad(hours)}:${pad(minutes % MINUTES_PER_HOUR)}` as LocalTime;
}

/** Returns the time if `text` is a real time of day in `HH:MM` format, or null. */
export function parseLocalTime(text: string): LocalTime | null {
  return FORMAT.test(text) ? (text as LocalTime) : null;
}

/** Like `parseLocalTime`, but throws on an invalid time. For literals known to be valid. */
export function localTime(text: string): LocalTime {
  const time = parseLocalTime(text);
  if (time === null) throw new RangeError(`Invalid local time: "${text}"`);
  return time;
}

/** The time of day of `instant` in the device's local time, without the seconds. */
export function localTimeOf(instant: Date): LocalTime {
  return fromMinutes(
    instant.getHours() * MINUTES_PER_HOUR + instant.getMinutes(),
  );
}

/** Minutes since 00:00. */
export function minutesOf(time: LocalTime): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

/**
 * Adds `minutes` (negative to go back) to a time of day. Returns null if the result falls
 * on another day.
 */
export function addMinutes(time: LocalTime, minutes: number): LocalTime | null {
  const total = minutesOf(time) + minutes;
  return total >= 0 && total < MINUTES_PER_DAY ? fromMinutes(total) : null;
}
