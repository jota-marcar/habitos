// Long-term goals: what the user wants to achieve before a deadline (RF-55 to RF-61, ADR-0027).
// A goal has a single total and no periods, so its configuration has no versions: a change
// applies to the whole goal. It is in progress from its first day to its deadline, both
// included.

import type { LocalDate } from "./dates";
import { later } from "./dates";
import { isDone } from "./day";
import { fail, ok, type Result } from "./result";
import {
  normalizeAmounts,
  validateAmounts,
  validateName,
  type Amounts,
  type AmountsError,
  type NameError,
  type TrackedColor,
  type TrackedType,
} from "./tracked";

export interface LongTermGoal extends Amounts {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the goal is created (RF-55). */
  readonly type: TrackedType;
  readonly color: TrackedColor | null;
  /** The day the goal starts. Cannot change. */
  readonly firstDay: LocalDate;
  /** The last day the goal is in progress: always after its first day. */
  readonly deadline: LocalDate;
}

/** The total recorded for a goal (RF-59): a single one, without the day it was done. */
export interface LongTermGoalEntry {
  readonly id: string;
  readonly longTermGoalId: string;
  readonly value: number;
}

export type DeadlineError = "deadline_not_after_first_day" | "deadline_in_past";

export type LongTermGoalError = NameError | AmountsError | DeadlineError;

export interface NewLongTermGoal {
  readonly name: string;
  readonly type: TrackedType;
  readonly color: TrackedColor | null;
  readonly amounts: Amounts;
  readonly deadline: LocalDate;
}

/**
 * The first day of a goal created while `shown` is on screen (RF-55): that day if it is in the
 * future, the current one otherwise.
 */
export function firstDayOfNewLongTermGoal(
  shown: LocalDate,
  today: LocalDate,
): LocalDate {
  return later(shown, today);
}

/**
 * A deadline is after the first day of the goal and, when it is chosen, not before the current
 * day (RF-55, RF-56).
 */
export function validateDeadline(
  deadline: LocalDate,
  firstDay: LocalDate,
  today: LocalDate,
): DeadlineError[] {
  if (deadline <= firstDay) return ["deadline_not_after_first_day"];
  return deadline < today ? ["deadline_in_past"] : [];
}

/**
 * Creates a goal that starts on `firstDay`, which `firstDayOfNewLongTermGoal` gives. The
 * identifier is generated outside the domain.
 */
export function createLongTermGoal(
  input: NewLongTermGoal,
  id: string,
  firstDay: LocalDate,
  today: LocalDate,
): Result<LongTermGoal, LongTermGoalError> {
  const errors: LongTermGoalError[] = [
    ...validateName(input.name),
    ...validateAmounts(input.type, input.amounts),
    ...validateDeadline(input.deadline, firstDay, today),
  ];
  if (errors.length > 0) return fail(errors);

  return ok({
    ...normalizeAmounts(input.amounts),
    id,
    name: input.name.trim(),
    type: input.type,
    color: input.color,
    firstDay,
    deadline: input.deadline,
  });
}

/** Whether a goal is in progress on `day`: from its first day to its deadline (RF-58). */
export function isInProgress(goal: LongTermGoal, day: LocalDate): boolean {
  return goal.firstDay <= day && day <= goal.deadline;
}

/** Whether a goal can still be edited: not once its deadline has passed (RF-56). */
export function canEditLongTermGoal(
  goal: LongTermGoal,
  today: LocalDate,
): boolean {
  return today <= goal.deadline;
}

/**
 * Whether something can be recorded for a goal while `day` is on screen (RF-59): the goal is in
 * progress that day and the day is not in the future. A goal forgotten before its deadline can
 * still be recorded from one of its days.
 */
export function canRecordLongTermGoal(
  goal: LongTermGoal,
  day: LocalDate,
  today: LocalDate,
): boolean {
  return isInProgress(goal, day) && day <= today;
}

/** Renames a goal (RF-56). */
export function renameLongTermGoal(
  goal: LongTermGoal,
  name: string,
): Result<LongTermGoal, NameError> {
  const errors = validateName(name);
  if (errors.length > 0) return fail(errors);
  return ok({ ...goal, name: name.trim() });
}

/** Gives a goal another color, or none (RF-56). */
export function recolorLongTermGoal(
  goal: LongTermGoal,
  color: TrackedColor | null,
): LongTermGoal {
  return { ...goal, color };
}

/**
 * Changes the amounts of a goal (RF-56). There are no versions: the goal becomes done or pending
 * again by what has been accumulated.
 */
export function changeLongTermGoalAmounts(
  goal: LongTermGoal,
  amounts: Amounts,
): Result<LongTermGoal, AmountsError> {
  const errors = validateAmounts(goal.type, amounts);
  if (errors.length > 0) return fail(errors);
  return ok({ ...goal, ...normalizeAmounts(amounts) });
}

/**
 * Moves the deadline of a goal (RF-56): after its first day and not before the current day.
 * The goal must be editable (`canEditLongTermGoal`).
 */
export function changeLongTermGoalDeadline(
  goal: LongTermGoal,
  deadline: LocalDate,
  today: LocalDate,
): Result<LongTermGoal, DeadlineError> {
  const errors = validateDeadline(deadline, goal.firstDay, today);
  if (errors.length > 0) return fail(errors);
  return ok({ ...goal, deadline });
}

/** A goal as it stands. */
export interface DayLongTermGoal {
  readonly goal: LongTermGoal;
  /** The total recorded: 0 if there is nothing. */
  readonly value: number;
  readonly done: boolean;
}

/**
 * The goals in progress on `day`, each with its total (RF-58): the nearest deadline first and,
 * on the same deadline, in the order of `goals`, which is expected to be the order of creation.
 */
export function longTermGoalsForDay(
  data: {
    readonly goals: readonly LongTermGoal[];
    readonly entries: readonly LongTermGoalEntry[];
  },
  day: LocalDate,
): DayLongTermGoal[] {
  const valueByGoal = new Map(
    data.entries.map((entry) => [entry.longTermGoalId, entry.value]),
  );
  return data.goals
    .filter((goal) => isInProgress(goal, day))
    .sort((a, b) =>
      a.deadline === b.deadline ? 0 : a.deadline < b.deadline ? -1 : 1,
    )
    .map((goal) => {
      const value = valueByGoal.get(goal.id) ?? 0;
      return { goal, value, done: isDone(goal.type, goal, value) };
    });
}
