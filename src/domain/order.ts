// The order in which the habits of a day are shown (RF-12). Like an agenda: two groups, the
// pending habits and the done ones. On the current day each group starts with the habits whose
// reminders have all gone off, then the others by their next reminder, and the habits without
// reminders at the end. On any other day there is no "now", so they go by their first reminder.
// While a day is on screen the order and the groups are kept, so the list does not move when a
// habit is marked: the interface computes them when it shows the day and then only keeps them.

import type { DayHabit } from "./day";
import type { Reminder } from "./reminders";
import type { LocalTime } from "./times";

// Where a habit goes: the habits that are overdue, then those still to warn, then those
// without reminders. The time orders the habits of each place.
const OVERDUE = "0";
const UPCOMING = "1";
const NO_REMINDER = "2";

/**
 * Sorts `items` by the reminders of their habit (RF-12). With `now`, the time on the current
 * day, first come the habits whose reminders have all gone off, by their last one; then the
 * others, by the next one after `now`. Without `now`, every habit goes by its first reminder.
 * Habits without reminders go last, and ties keep the order of `items`, which is expected to be
 * the order of creation. A reminder at `now` has already gone off, as for the planner.
 */
export function sortByReminders<T>(
  items: readonly T[],
  habitIdOf: (item: T) => string,
  reminders: readonly Reminder[],
  now: LocalTime | null,
): T[] {
  const timesByHabit = new Map<string, LocalTime[]>();
  for (const reminder of reminders) {
    const times = timesByHabit.get(reminder.habitId);
    if (times) times.push(reminder.time);
    else timesByHabit.set(reminder.habitId, [reminder.time]);
  }

  const rank = (item: T): string => {
    const times = [...(timesByHabit.get(habitIdOf(item)) ?? [])].sort();
    if (times.length === 0) return NO_REMINDER;
    if (now === null) return UPCOMING + times[0];
    const next = times.find((time) => time > now);
    return next === undefined
      ? OVERDUE + times[times.length - 1]
      : UPCOMING + next;
  };

  // Array.prototype.sort is stable, so ties keep the order of creation.
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .sort((a, b) => {
      if (a.rank === b.rank) return 0;
      return a.rank < b.rank ? -1 : 1;
    })
    .map(({ item }) => item);
}

/** The two groups of the day view (RF-12): the top one and the bottom one. */
export interface DayGroups<T> {
  readonly pending: readonly T[];
  readonly done: readonly T[];
}

/**
 * The groups of the day view when it is shown (RF-12): pending habits and done ones, each
 * sorted by its reminders. `now` is the time if the day is the current one, or null.
 */
export function sortDayHabits(
  dayHabits: readonly DayHabit[],
  reminders: readonly Reminder[],
  now: LocalTime | null,
): DayGroups<DayHabit> {
  const sorted = sortByReminders(dayHabits, (d) => d.habit.id, reminders, now);
  return {
    pending: sorted.filter((d) => !d.done),
    done: sorted.filter((d) => d.done),
  };
}

/**
 * Puts `items` in the groups and the order of `groups`, computed when the day was shown, so
 * that a habit marked while the day is on screen stays where it is (RF-12). Items whose habit
 * is in neither group are new, and go at the end of the pending ones.
 */
export function keepGroups<T>(
  items: readonly T[],
  habitIdOf: (item: T) => string,
  groups: DayGroups<string>,
): DayGroups<T> {
  const doneIds = new Set(groups.done);
  const isDone = (item: T) => doneIds.has(habitIdOf(item));
  return {
    pending: keepOrder(
      items.filter((item) => !isDone(item)),
      habitIdOf,
      groups.pending,
    ),
    done: keepOrder(items.filter(isDone), habitIdOf, groups.done),
  };
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
