// Pending digests: two warnings a day, at fixed times, that name the habits of the day still
// pending (RF-37). Like reminders, they are local notifications scheduled ahead (ADR-0005),
// so a digest of today has to be cancelled as soon as nothing is pending any more.

import { addDays, type LocalDate } from "./dates";
import { habitsForDay, type DayHabit } from "./day";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import { sortByReminders } from "./order";
import { MAX_UPCOMING_REMINDERS, type Reminder } from "./reminders";
import { tasksPendingAt, type Task } from "./tasks";
import { localTime, type LocalDateTime, type LocalTime } from "./times";

/** The digest that also counts the pending tasks, every day until they are due (RF-37). */
const TASKS_DIGEST_TIME = localTime("17:00");

/** The times of the digests, the same every day until there are settings (RF-37). */
export const PENDING_DIGEST_TIMES: readonly LocalTime[] = [
  TASKS_DIGEST_TIME,
  localTime("22:00"),
];

const DAYS_PER_WEEK = 7;

export interface PendingDigest {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** The habits pending that day, in the order the day view would show at `time` (RF-12). */
  readonly habits: readonly DayHabit[];
  /** The tasks pending at that moment, the one due first going first (RF-37). */
  readonly tasks: readonly Task[];
}

/**
 * The next digests to schedule after `now`, soonest first and `limit` at most. A digest is sent
 * while some habit of that day is not done, in progress or not, or, at 17:00, some task is
 * still pending (RF-37). Archived habits do not count (RF-10). Future days cannot be recorded
 * yet, so their digests name every habit of the day: refreshing on that day removes those done
 * by then.
 */
export function upcomingPendingDigests(
  data: {
    readonly habits: readonly Habit[];
    readonly versions: readonly HabitVersion[];
    readonly entries: readonly Entry[];
    readonly reminders: readonly Reminder[];
    readonly tasks?: readonly Task[];
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

  // As with reminders: every habit is scheduled at least once a week, and today may give
  // nothing because its times have passed.
  while (upcoming.length < limit && emptyDays <= DAYS_PER_WEEK) {
    const pending = habitsForDay(source, date).filter((d) => !d.done);

    const ofDay: PendingDigest[] = [];
    for (const time of PENDING_DIGEST_TIMES) {
      if (date === now.date && time <= now.time) continue;
      const tasks =
        time === TASKS_DIGEST_TIME
          ? tasksPendingAt(data.tasks ?? [], { date, time })
          : [];
      if (pending.length === 0 && tasks.length === 0) continue;
      const habits = sortByReminders(
        pending,
        (d) => d.habit.id,
        data.reminders,
        time,
      );
      ofDay.push({ date, time, habits, tasks });
    }

    upcoming.push(...ofDay);
    emptyDays = ofDay.length === 0 ? emptyDays + 1 : 0;
    date = addDays(date, 1);
  }

  return upcoming.slice(0, limit);
}
