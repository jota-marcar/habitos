// The order in which the habits of a day are shown (RF-12). Like an agenda: pending habits
// first and done ones after, each group by the time of its first reminder, with the habits
// without reminders at the end. While a day is on screen the order is kept, so the list does
// not move when a habit is marked: the interface computes it when it shows the day and then
// only keeps it.

import type { DayHabit } from "./day";
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

/**
 * The order of the day view when it is shown (RF-12): pending habits first and done ones
 * after, each group sorted by its first reminder.
 */
export function sortDayHabits(
  dayHabits: readonly DayHabit[],
  reminders: readonly Reminder[],
): DayHabit[] {
  const sorted = sortByFirstReminder(dayHabits, (d) => d.habit.id, reminders);
  return [...sorted.filter((d) => !d.done), ...sorted.filter((d) => d.done)];
}

/**
 * Puts `items` in the order of `habitIds`, the order computed when the day was shown, so that
 * the list does not move while it is on screen (RF-12). Items whose habit is not in
 * `habitIds` go at the end, in the order they come.
 */
export function keepOrder<T>(
  items: readonly T[],
  habitIdOf: (item: T) => string,
  habitIds: readonly string[],
): T[] {
  const positions = new Map(habitIds.map((id, index) => [id, index]));
  const position = (item: T) =>
    positions.get(habitIdOf(item)) ?? habitIds.length;
  // Array.prototype.sort is stable, so the new items keep the order they come in.
  return [...items].sort((a, b) => position(a) - position(b));
}
