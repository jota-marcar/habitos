// Progress digests: two warnings a week, at fixed times, that name the weekly goals not achieved
// yet and how far each one has got (RF-49). Like reminders, they are local notifications
// scheduled ahead (ADR-0005), so a digest has to be cancelled as soon as nothing is left.

import { addDays, type LocalDate } from "./dates";
import { groupGoals } from "./order";
import { localTime, type LocalDateTime, type LocalTime } from "./times";
import {
  goalsForWeek,
  type WeekGoal,
  type WeeklyGoal,
  type WeeklyGoalEntry,
  type WeeklyGoalVersion,
} from "./weekly-goals";
import { weekOf } from "./weeks";

/** When the digests warn each week: Thursday at 20:00 and Sunday at 11:00 (RF-49). */
export const PROGRESS_DIGEST_MOMENTS: readonly {
  readonly daysAfterMonday: number;
  readonly time: LocalTime;
}[] = [
  { daysAfterMonday: 3, time: localTime("20:00") },
  { daysAfterMonday: 6, time: localTime("11:00") },
];

/**
 * How many of the next moments are scheduled: two weeks. If the app stops being opened, the
 * digests stop too, instead of leaving months of them scheduled.
 */
export const UPCOMING_PROGRESS_MOMENTS = 4;

// Enough weeks to find the next moments, even if those of the current week have passed.
const WEEK_OFFSETS = [0, 7, 14];

export interface ProgressDigest {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** The goals not achieved that week, in the order of the weekly page (RF-46). */
  readonly goals: readonly WeekGoal[];
}

/**
 * The digests of the next moments after `now`, soonest first. A moment without goals left has
 * no digest. Archived goals do not count, even in the week they still show in (RF-44). Future
 * weeks cannot be recorded yet (RF-47), so their digests name every goal from zero: refreshing
 * in that week brings them up to date.
 */
export function upcomingProgressDigests(
  data: {
    readonly goals: readonly WeeklyGoal[];
    readonly versions: readonly WeeklyGoalVersion[];
    readonly entries: readonly WeeklyGoalEntry[];
  },
  now: LocalDateTime,
): ProgressDigest[] {
  const source = {
    ...data,
    goals: data.goals.filter((goal) => goal.archivedWeek === null),
  };
  const monday = weekOf(now.date).start;

  return WEEK_OFFSETS.flatMap((offset) =>
    PROGRESS_DIGEST_MOMENTS.map(({ daysAfterMonday, time }) => ({
      date: addDays(monday, offset + daysAfterMonday),
      time,
    })),
  )
    .filter(
      ({ date, time }) =>
        date > now.date || (date === now.date && time > now.time),
    )
    .slice(0, UPCOMING_PROGRESS_MOMENTS)
    .flatMap(({ date, time }) => {
      const { pending } = groupGoals(goalsForWeek(source, weekOf(date)));
      return pending.length === 0 ? [] : [{ date, time, goals: pending }];
    });
}
