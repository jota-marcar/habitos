// The day the main screen shows when a form closes. Something created from a past day or week
// starts in the current one, so the screen goes there for it to be seen (RF-06, RF-42).

import type { LocalDate } from "@/domain/dates";

let requested: LocalDate | null = null;

/** Asks the main screen to show `date` the next time it gains focus. */
export function showDayOnReturn(date: LocalDate): void {
  requested = date;
}

/** The day asked for, if any. It is only given once. */
export function takeDayOnReturn(): LocalDate | null {
  const date = requested;
  requested = null;
  return date;
}
