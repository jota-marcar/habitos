// Reminders: the times of day at which a habit warns the user, and the calculation of which
// ones have to be scheduled next (RF-22 to RF-25, ADR-0005).
// Reminders are not versioned: they only affect the future.

import { addDays, type LocalDate } from "./dates";
import { habitsForDay, type DayHabit } from "./day";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import { fail, ok, type Result } from "./result";
import {
  addMinutes,
  minutesOf,
  type LocalDateTime,
  type LocalTime,
} from "./times";

export interface Reminder {
  readonly id: string;
  readonly habitId: string;
  readonly time: LocalTime;
}

export type ReminderError = "time_duplicated";

/** How long a reminder is snoozed for. The same for every habit (RF-25). */
export const SNOOZE_MINUTES = 60;

/**
 * iOS keeps at most 64 pending local notifications per app. The window leaves room for the
 * snoozed ones (ADR-0005).
 */
export const MAX_UPCOMING_REMINDERS = 60;

const DAYS_PER_WEEK = 7;

/**
 * Adds a reminder to those of its habit and returns them all. A habit cannot have two
 * reminders at the same time (RF-22). `reminders` belong to the habit of `reminder`.
 */
export function addReminder(
  reminders: readonly Reminder[],
  reminder: Reminder,
): Result<readonly Reminder[], ReminderError> {
  if (reminders.some((r) => r.time === reminder.time)) {
    return fail(["time_duplicated"]);
  }
  return ok([...reminders, reminder]);
}

/** Removes a reminder. Removing one that is not there changes nothing. */
export function removeReminder(
  reminders: readonly Reminder[],
  reminderId: string,
): readonly Reminder[] {
  return reminders.filter((r) => r.id !== reminderId);
}

/**
 * The time at which a reminder snoozed at `now` warns again, or null if that would be the
 * next day: a reminder never leaves the day of its habit (RF-25).
 */
export function snoozedTime(now: LocalTime): LocalTime | null {
  return addMinutes(now, SNOOZE_MINUTES);
}

/** A reminder that has to warn on a specific day. */
export interface UpcomingReminder {
  readonly reminder: Reminder;
  readonly date: LocalDate;
  /** The habit as it is that day, so that the warning can show the progress (RF-24). */
  readonly dayHabit: DayHabit;
}

/**
 * The next reminders to schedule after `now`, soonest first and `limit` at most (ADR-0005).
 * A reminder warns on the scheduled days of its habit (RF-23), unless the habit is already
 * done that day (RF-24) or archived (RF-10). A habit in progress still warns.
 * Reminders at the same minute keep the order of `reminders`.
 */
export function upcomingReminders(
  data: {
    readonly habits: readonly Habit[];
    readonly versions: readonly HabitVersion[];
    readonly entries: readonly Entry[];
    readonly reminders: readonly Reminder[];
  },
  now: LocalDateTime,
  limit: number = MAX_UPCOMING_REMINDERS,
): UpcomingReminder[] {
  const source = {
    habits: data.habits.filter((habit) => habit.archivedOn === null),
    versions: data.versions,
    entries: data.entries,
  };

  const upcoming: UpcomingReminder[] = [];
  let date = now.date;
  let emptyDays = 0;

  // Every habit is scheduled at least once a week. Today may give nothing because its
  // reminders have passed, so the search only stops after a whole empty week beyond it.
  while (upcoming.length < limit && emptyDays <= DAYS_PER_WEEK) {
    const pending = new Map(
      habitsForDay(source, date)
        .filter((dayHabit) => !dayHabit.done)
        .map((dayHabit) => [dayHabit.habit.id, dayHabit]),
    );

    const ofDay: UpcomingReminder[] = [];
    for (const reminder of data.reminders) {
      const dayHabit = pending.get(reminder.habitId);
      if (dayHabit === undefined) continue;
      if (date === now.date && reminder.time <= now.time) continue;
      ofDay.push({ reminder, date, dayHabit });
    }
    ofDay.sort(
      (a, b) => minutesOf(a.reminder.time) - minutesOf(b.reminder.time),
    );

    upcoming.push(...ofDay);
    emptyDays = ofDay.length === 0 ? emptyDays + 1 : 0;
    date = addDays(date, 1);
  }

  return upcoming.slice(0, limit);
}
