// Pending digests: two warnings a day, at fixed times, that name the habits of the day still
// pending (RF-37). Like reminders, they are local notifications scheduled ahead (ADR-0005),
// so a digest of today has to be cancelled as soon as nothing is pending any more.

import { addDays, type LocalDate } from "./dates";
import { nextStartAfter, scheduledHabitsForDay, type DayHabit } from "./day";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import { sortByReminders } from "./order";
import { MAX_UPCOMING_REMINDERS, type Reminder } from "./reminders";
import { localTime, type LocalDateTime, type LocalTime } from "./times";

/** The times of the digests, the same every day until there are settings (RF-37). */
export const PENDING_DIGEST_TIMES: readonly LocalTime[] = [
  localTime("17:00"),
  localTime("22:00"),
];

const DAYS_PER_WEEK = 7;

export interface PendingDigest {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** The habits pending that day, in the order the day view would show at `time` (RF-12). */
  readonly habits: readonly DayHabit[];
}

/**
 * The next digests to schedule after `now`, soonest first and `limit` at most. A day has its
 * digests while some habit of that day is not done, in progress or not (RF-37). Archived
 * habits do not count (RF-10). Future days cannot be recorded yet, so their digests name every
 * habit of the day: refreshing on that day removes those done by then.
 */
export function upcomingPendingDigests(
  data: {
    readonly habits: readonly Habit[];
    readonly versions: readonly HabitVersion[];
    readonly entries: readonly Entry[];
    readonly reminders: readonly Reminder[];
  },
  now: LocalDateTime,
  limit: number = MAX_UPCOMING_REMINDERS,
): PendingDigest[] {
  const source = {
    habits: data.habits.filter((habit) => habit.archivedOn === null),
    versions: data.versions,
    entries: data.entries,
  };

  const upcoming: PendingDigest[] = [];
  let date = now.date;
  let emptyDays = 0;

  // As with reminders: every habit is scheduled at least once a week and today may give
  // nothing because its times have passed, so a whole empty week beyond it means that nothing
  // else is due until the next habit starts.
  while (upcoming.length < limit) {
    const pending = scheduledHabitsForDay(source, date).filter((d) => !d.done);

    const ofDay: PendingDigest[] = [];
    if (pending.length > 0) {
      for (const time of PENDING_DIGEST_TIMES) {
        if (date === now.date && time <= now.time) continue;
        const habits = sortByReminders(
          pending,
          (d) => d.habit.id,
          data.reminders,
          time,
        );
        ofDay.push({ date, time, habits });
      }
    }

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
