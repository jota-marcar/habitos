// Weeks, from Monday to Sunday, the period of the weekly goals (RF-40).

import { addDays, weekdayOf, type LocalDate } from "./dates";

export interface Week {
  /** Its Monday. */
  readonly start: LocalDate;
  /** Its Sunday. */
  readonly end: LocalDate;
}

/** The week that `date` falls in. */
export function weekOf(date: LocalDate): Week {
  const start = addDays(date, -weekdayOf(date));
  return { start, end: addDays(start, 6) };
}

export function isInWeek(date: LocalDate, { start, end }: Week): boolean {
  return date >= start && date <= end;
}
