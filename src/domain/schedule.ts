// Scheduled days: the days of the week on which a habit is due.
// They are stored as a 7-bit mask shared by the local database and the backend:
// bit 0 = Monday, bit 1 = Tuesday … bit 6 = Sunday.

import type { Weekday } from "./dates";

/** A 7-bit mask of weekdays. */
export type ScheduledDays = number;

export const NO_DAYS: ScheduledDays = 0;
export const EVERY_DAY: ScheduledDays = 0b1111111;

/** True if `value` is an integer that only uses the 7 weekday bits. */
export function isValidScheduledDays(value: number): boolean {
  return Number.isInteger(value) && value >= NO_DAYS && value <= EVERY_DAY;
}

export function scheduledDaysFrom(weekdays: readonly Weekday[]): ScheduledDays {
  return weekdays.reduce((mask, weekday) => mask | (1 << weekday), NO_DAYS);
}

/** The weekdays in the mask, from Monday to Sunday. */
export function weekdaysIn(scheduledDays: ScheduledDays): Weekday[] {
  const all: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
  return all.filter((weekday) => isScheduledOn(scheduledDays, weekday));
}

export function isScheduledOn(
  scheduledDays: ScheduledDays,
  weekday: Weekday,
): boolean {
  return (scheduledDays & (1 << weekday)) !== 0;
}
