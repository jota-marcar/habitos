// The habits of a day: which habits are due on a date and how each one is going.
// This is what the main screen shows (RF-12, RF-13).

import { weekdayOf, type LocalDate } from "./dates";
import type { Entry } from "./entries";
import {
  versionOn,
  type Habit,
  type HabitType,
  type HabitVersion,
} from "./habits";
import { isScheduledOn } from "./schedule";

export interface DayHabit {
  readonly habit: Habit;
  /** The configuration in force that day, which may differ from the current one. */
  readonly version: HabitVersion;
  /** What is recorded that day: 0 if there is nothing. */
  readonly value: number;
  readonly done: boolean;
}

/**
 * A boolean habit is done when it is marked; a quantitative one, when the accumulated amount
 * reaches the target of the version in force that day (RF-16).
 */
export function isDone(
  type: HabitType,
  version: HabitVersion,
  value: number,
): boolean {
  if (type === "boolean") return value >= 1;
  return version.target !== null && value >= version.target;
}

// An archived habit stops appearing after the day it was archived. On that day it only
// appears if something was recorded, so that no history is hidden (RF-10).
function isRetiredOn(habit: Habit, date: LocalDate, value: number): boolean {
  if (habit.archivedOn === null || date < habit.archivedOn) return false;
  return date > habit.archivedOn || value === 0;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/**
 * The habits due on `date`, in the order of `habits`: those created on or before that day,
 * not retired by archiving, and scheduled for that weekday in the version in force then
 * (RF-12, RF-17). It works the same for past, present and future days.
 */
export function habitsForDay(
  data: {
    readonly habits: readonly Habit[];
    readonly versions: readonly HabitVersion[];
    readonly entries: readonly Entry[];
  },
  date: LocalDate,
): DayHabit[] {
  const weekday = weekdayOf(date);
  const versionsByHabit = groupBy(data.versions, (v) => v.habitId);
  const valueByHabit = new Map(
    data.entries
      .filter((e) => e.date === date)
      .map((e) => [e.habitId, e.value]),
  );

  const dayHabits: DayHabit[] = [];
  for (const habit of data.habits) {
    if (habit.createdOn > date) continue;

    const value = valueByHabit.get(habit.id) ?? 0;
    if (isRetiredOn(habit, date, value)) continue;

    const version = versionOn(versionsByHabit.get(habit.id) ?? [], date);
    if (version === null || !isScheduledOn(version.scheduledDays, weekday)) {
      continue;
    }

    dayHabits.push({
      habit,
      version,
      value,
      done: isDone(habit.type, version, value),
    });
  }
  return dayHabits;
}
