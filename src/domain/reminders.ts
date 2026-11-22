// Reminders: the times of day at which a habit warns the user, and the calculation of which
// ones have to be scheduled next (RF-22 to RF-25, ADR-0005).
// Reminders are not versioned: they only affect the future.

import { addDays, type LocalDate } from "./dates";
import { habitsForDay, nextStartAfter, type DayHabit } from "./day";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import { fail, ok, type Result } from "./result";
import {
  addMinutes,
  localTime,
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

/** The time of the final notice, which asks to open the app before the window ends (RF-51). */
export const FINAL_NOTICE_TIME = localTime("12:00");

/** For how many days, at most, reminders explain how to reach their buttons (RF-25). */
export const GESTURE_HINT_DAYS = 7;

/** What the device knows about teaching the gesture that shows the buttons (RF-25). */
export interface GestureHint {
  /** The day of the first reminder that explained it, or null if none has yet. */
  readonly startedOn: LocalDate | null;
  /** Whether the user has already used a button of a reminder. */
  readonly learned: boolean;
}

/**
 * Whether a reminder on `date` explains the gesture: until the user first uses a button, and
 * for a few days at most, so that nobody keeps reading it forever (RF-25).
 */
export function showsGestureHint(
  { startedOn, learned }: GestureHint,
  date: LocalDate,
): boolean {
  if (learned) return false;
  return startedOn === null || date < addDays(startedOn, GESTURE_HINT_DAYS);
}

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
  // reminders have passed, so a whole empty week beyond it means that nothing else is due
  // until the next habit starts, however far away that is.
  while (upcoming.length < limit) {
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
    if (emptyDays <= DAYS_PER_WEEK) {
      date = addDays(date, 1);
      continue;
    }
    const nextStart = nextStartAfter(source.habits, date);
    if (nextStart === null) break;
    date = nextStart;
    emptyDays = 0;
  }

  return upcoming.slice(0, limit);
}

/**
 * When the final notice warns: at noon of the day before the last warning of the window, so
 * that opening the app in time loses none. If that has already passed, with the last warning
 * (RF-51).
 */
export function finalNoticeMoment(
  lastWarning: LocalDateTime,
  now: LocalDateTime,
): LocalDateTime {
  const date = addDays(lastWarning.date, -1);
  const isAhead =
    date > now.date || (date === now.date && FINAL_NOTICE_TIME > now.time);
  return isAhead ? { date, time: FINAL_NOTICE_TIME } : lastWarning;
}
