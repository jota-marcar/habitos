// The order in which habits are shown, in the day view and in the list of habits (RF-07, RF-12).
// Like an agenda: by the time of their first reminder, with the habits without reminders at
// the end. A habit that is done keeps its place, so the list does not move when it is marked.

import type { Reminder } from "./reminders";
import type { LocalTime } from "./times";

/**
 * Sorts `items` by the earliest reminder of their habit. Habits without reminders go last, and
 * ties keep the order of `items`, which is expected to be the order of creation.
 */
export function sortByFirstReminder<T>(
  items: readonly T[],
  habitIdOf: (item: T) => string,
  reminders: readonly Reminder[],
): T[] {
  const firstTimes = new Map<string, LocalTime>();
  for (const reminder of reminders) {
    const current = firstTimes.get(reminder.habitId);
    if (current === undefined || reminder.time < current) {
      firstTimes.set(reminder.habitId, reminder.time);
    }
  }

  const rank = (item: T): string =>
    firstTimes.get(habitIdOf(item)) ?? NO_REMINDER;

  // Array.prototype.sort is stable, so ties keep the order of creation.
  return [...items].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra === rb) return 0;
    return ra < rb ? -1 : 1;
  });
}

// Sorts after every valid time of day ("23:59").
const NO_REMINDER = "~";
