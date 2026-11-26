// Long-term goal digests: a warning a week, at a fixed time, that names the goals that need
// attention: those with an amount that are behind their pace, and the yes-or-no ones close to
// their deadline (RF-63). Like reminders, they are local notifications scheduled ahead
// (ADR-0005), so a digest has to be cancelled as soon as no goal needs attention.

import { addDays, type LocalDate } from "./dates";
import {
  daysLeft,
  longTermGoalsForDay,
  paceOf,
  type DayLongTermGoal,
  type LongTermGoal,
  type LongTermGoalEntry,
} from "./long-term-goals";
import { localTime, type LocalDateTime, type LocalTime } from "./times";
import { weekOf } from "./weeks";

/** When the digest warns each week: Monday at 20:00 (RF-63). */
export const LONG_TERM_GOAL_DIGEST_MOMENT: {
  readonly daysAfterMonday: number;
  readonly time: LocalTime;
} = { daysAfterMonday: 0, time: localTime("20:00") };

/**
 * How many of the next moments are scheduled: two weeks, like the progress digests. If the app
 * stops being opened, the digests stop too.
 */
export const UPCOMING_LONG_TERM_GOAL_MOMENTS = 2;

/** A yes-or-no goal needs attention when this many days or fewer are left (RF-63). */
export const COUNTDOWN_DAYS = 7;

// Enough weeks to find the next moments, even if the one of the current week has passed.
const WEEK_OFFSETS = [0, 7, 14];

/** A goal that needs attention at the moment of a digest. */
export type GoalNeedingAttention = DayLongTermGoal &
  (
    | {
        readonly reason: "behind";
        /** The amount of the goal: a goal with a pace always has one. */
        readonly target: number;
        /** How much it lacks to be on pace, in whole increments. */
        readonly amount: number;
      }
    | { readonly reason: "deadline"; readonly daysLeft: number }
  );

export interface LongTermGoalDigest {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** In the order of the page of long-term goals (RF-58). */
  readonly goals: readonly GoalNeedingAttention[];
}

/** Why a goal needs attention on `date`, or null if it does not (RF-63). */
function attentionOf(
  dayGoal: DayLongTermGoal,
  date: LocalDate,
): GoalNeedingAttention | null {
  const { goal, value, done } = dayGoal;
  if (done) return null;
  if (goal.type === "boolean") {
    const left = daysLeft(goal.deadline, date);
    return left <= COUNTDOWN_DAYS
      ? { ...dayGoal, reason: "deadline", daysLeft: left }
      : null;
  }
  const pace = paceOf(goal, value, date);
  return pace?.kind === "behind" && goal.target !== null
    ? { ...dayGoal, reason: "behind", target: goal.target, amount: pace.amount }
    : null;
}

/**
 * The digests of the next moments after `now`, soonest first. A moment with no goal needing
 * attention has no digest. Goals have a single total without days (RF-59), so a future digest is
 * worked out with the total of now: refreshing after recording brings it up to date.
 */
export function upcomingLongTermGoalDigests(
  data: {
    readonly goals: readonly LongTermGoal[];
    readonly entries: readonly LongTermGoalEntry[];
  },
  now: LocalDateTime,
): LongTermGoalDigest[] {
  const monday = weekOf(now.date).start;
  const { daysAfterMonday, time } = LONG_TERM_GOAL_DIGEST_MOMENT;

  return WEEK_OFFSETS.map((offset) => addDays(monday, offset + daysAfterMonday))
    .filter((date) => date > now.date || (date === now.date && time > now.time))
    .slice(0, UPCOMING_LONG_TERM_GOAL_MOMENTS)
    .flatMap((date) => {
      const goals = longTermGoalsForDay(data, date).flatMap((dayGoal) => {
        const attention = attentionOf(dayGoal, date);
        return attention === null ? [] : [attention];
      });
      return goals.length === 0 ? [] : [{ date, time, goals }];
    });
}
