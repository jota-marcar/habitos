// The order in which the habits of a day are shown (RF-12). Like an agenda: two groups, the
// pending habits and the done ones. On the current day each group starts with the habits whose
// reminders have all gone off, then the others by their next reminder, and the habits without
// reminders at the end. On any other day there is no "now", so they go by their first reminder.
// While a day is on screen the order and the groups are kept, so the list does not move under
// the finger: the interface computes them when it shows the day and then keeps them, except that
// after a pause in the taps the habits that were done or undone move to their group.

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
 * Moves to the other group the habits of `groups` that are in the wrong one: done habits in the
 * pending group and pending habits in the done group (RF-12). Each goes where the sorting of the
 * day would put it among the habits already there; the others keep their places, so the list
 * only changes where a habit leaves and where it arrives. `now` is as in `sortDayHabits`. Habits
 * that are not in `dayHabits` are left as they are.
 */
export function settleGroups(
  dayHabits: readonly DayHabit[],
  groups: DayGroups<string>,
  reminders: readonly Reminder[],
  now: LocalTime | null,
): DayGroups<string> {
  const sorted = sortByReminders(
    dayHabits,
    (d) => d.habit.id,
    reminders,
    now,
  ).map((d) => d.habit.id);
  const doneIds = new Set(
    dayHabits.filter((d) => d.done).map((d) => d.habit.id),
  );
  return moveToTheirGroup(sorted, doneIds, groups);
}

/** What the pages of goals need to group them: weekly goals (RF-46) and long-term goals (RF-58). */
export interface GroupedGoal {
  readonly goal: { readonly id: string };
  readonly done: boolean;
}

/**
 * The groups of a page of goals when it is shown (RF-46, RF-58): pending goals and achieved
 * ones, each in the order of `goals`.
 */
export function groupGoals<T extends GroupedGoal>(
  goals: readonly T[],
): DayGroups<T> {
  return {
    pending: goals.filter((g) => !g.done),
    done: goals.filter((g) => g.done),
  };
}

/**
 * Moves to the other group the goals of `groups` that are in the wrong one, like `settleGroups`
 * with the habits of a day (RF-46, RF-58). Goals that are not in `goals` are left as they are.
 */
export function settleGoals(
  goals: readonly GroupedGoal[],
  groups: DayGroups<string>,
): DayGroups<string> {
  const doneIds = new Set(goals.filter((g) => g.done).map((g) => g.goal.id));
  return moveToTheirGroup(
    goals.map((g) => g.goal.id),
    doneIds,
    groups,
  );
}

// `sorted` is the order the items would have if they were sorted again.
function moveToTheirGroup(
  sorted: readonly string[],
  doneIds: ReadonlySet<string>,
  groups: DayGroups<string>,
): DayGroups<string> {
  const isPending = (id: string) => sorted.includes(id) && !doneIds.has(id);

  const pending = groups.pending.filter((id) => !doneIds.has(id));
  const done = groups.done.filter((id) => !isPending(id));
  const toDone = groups.pending.filter((id) => doneIds.has(id));
  const toPending = groups.done.filter(isPending);

  // A habit goes before the first one of its new group that the sorting puts after it.
  const place = (group: string[], id: string) => {
    const after = group.findIndex(
      (other) => sorted.indexOf(other) > sorted.indexOf(id),
    );
    group.splice(after === -1 ? group.length : after, 0, id);
  };
  toDone.forEach((id) => place(done, id));
  toPending.forEach((id) => place(pending, id));
  return { pending, done };
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
