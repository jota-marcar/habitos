// Pending digests: a warning a day, at the time chosen in the settings, that names the habits of
// the day still pending (RF-37). Like reminders, they are local notifications scheduled ahead (ADR-0005),
// so a digest of today has to be cancelled as soon as nothing is pending any more.

import { addDays, type LocalDate } from "./dates";
import { nextStartAfter, scheduledHabitsForDay, type DayHabit } from "./day";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import { sortByReminders } from "./order";
import { MAX_UPCOMING_REMINDERS, type Reminder } from "./reminders";
import { localTime, type LocalDateTime, type LocalTime } from "./times";

/** What the user chose for the digest on this device (RF-37). */
export interface PendingDigestSettings {
  readonly enabled: boolean;
  /** Kept while it is disabled, so that enabling it again brings the last time back. */
  readonly time: LocalTime;
}

/**
 * Until the user chooses otherwise: on, at 21:00. Late on purpose: there is still time to do
 * something, and it covers almost everything there is to record (RF-37).
 */
export const DEFAULT_PENDING_DIGEST: PendingDigestSettings = {
  enabled: true,
  time: localTime("21:00"),
};

const DAYS_PER_WEEK = 7;

export interface PendingDigest {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** The habits pending that day, in the order the day view would show at `time` (RF-12). */
  readonly habits: readonly DayHabit[];
}

/**
 * The next digests to schedule after `now`, soonest first and `limit` at most: none if the user
 * has disabled them. A day has its digest while some habit of that day is not done, in progress
 * or not (RF-37). Archived habits do not count (RF-10). Future days cannot be recorded yet, so
 * their digests name every habit of the day: refreshing on that day removes those done by then.
 */
export function upcomingPendingDigests(
  data: {
    readonly habits: readonly Habit[];
    readonly versions: readonly HabitVersion[];
    readonly entries: readonly Entry[];
    readonly reminders: readonly Reminder[];
  },
  now: LocalDateTime,
  settings: PendingDigestSettings,
  limit: number = MAX_UPCOMING_REMINDERS,
): PendingDigest[] {
  if (!settings.enabled) return [];
  const { time } = settings;
  const source = {
    habits: data.habits.filter((habit) => habit.archivedOn === null),
    versions: data.versions,
    entries: data.entries,
  };

  const upcoming: PendingDigest[] = [];
  let date = now.date;
  let emptyDays = 0;

  // As with reminders: every habit is scheduled at least once a week and today may give
  // nothing because its time has passed, so a whole empty week beyond it means that nothing
  // else is due until the next habit starts.
  while (upcoming.length < limit) {
    const pending = scheduledHabitsForDay(source, date).filter((d) => !d.done);

    const passed = date === now.date && time <= now.time;
    if (pending.length > 0 && !passed) {
      const habits = sortByReminders(
        pending,
        (d) => d.habit.id,
        data.reminders,
        time,
      );
      upcoming.push({ date, time, habits });
      emptyDays = 0;
    } else {
      emptyDays += 1;
    }
    if (emptyDays <= DAYS_PER_WEEK) {
      date = addDays(date, 1);
      continue;
    }
    const nextStart = nextStartAfter(source.habits, date);
    if (nextStart === null) break;
    date = nextStart;
    emptyDays = 0;
  }

  return upcoming;
}
