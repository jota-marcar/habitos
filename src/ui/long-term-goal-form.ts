// The state of the form of a long-term goal and its conversion into a new goal (RF-55) or into
// the changes to an existing one (RF-56). The rules are the domain's: this only turns what the
// user typed into its input.

import type { LocalDate } from "@/domain/dates";
import {
  changeLongTermGoalAmounts,
  changeLongTermGoalDeadline,
  createLongTermGoal,
  recolorLongTermGoal,
  renameLongTermGoal,
  type DeadlineError,
  type LongTermGoal,
  type LongTermGoalError,
} from "@/domain/long-term-goals";
import type { TrackedColor } from "@/domain/tracked";

import {
  EMPTY_AMOUNTS,
  amountValuesOf,
  amountsOf,
  type AmountValues,
} from "./amounts-form";

export interface LongTermGoalFormValues extends AmountValues {
  readonly name: string;
  readonly color: TrackedColor | null;
  /** Null until it is chosen: it has no default (RF-55). */
  readonly deadline: LocalDate | null;
}

export const EMPTY_LONG_TERM_GOAL_FORM: LongTermGoalFormValues = {
  ...EMPTY_AMOUNTS,
  name: "",
  color: null,
  deadline: null,
};

export type LongTermGoalFormResult =
  | { readonly ok: true; readonly goal: LongTermGoal }
  | { readonly ok: false; readonly errors: readonly LongTermGoalError[] };

/** Builds a new goal from the form, starting on `firstDay` (RF-55). */
export function buildLongTermGoal(
  values: LongTermGoalFormValues,
  id: string,
  firstDay: LocalDate,
  today: LocalDate,
): LongTermGoalFormResult {
  const result = createLongTermGoal(
    {
      name: values.name,
      type: values.type,
      color: values.color,
      amounts: amountsOf(values.type, values),
      deadline: values.deadline,
    },
    id,
    firstDay,
    today,
  );
  return result.ok
    ? { ok: true, goal: result.value }
    : { ok: false, errors: result.errors };
}

/** The form filled in with a goal (RF-56). */
export function longTermGoalFormOf(goal: LongTermGoal): LongTermGoalFormValues {
  return {
    ...amountValuesOf(goal.type, goal),
    name: goal.name,
    color: goal.color,
    deadline: goal.deadline,
  };
}

/**
 * Builds the changes to a goal from the form (RF-56). Everything applies to the whole goal, with
 * no versions. The type stays as it was, whatever the form says.
 */
export function buildLongTermGoalChanges(
  goal: LongTermGoal,
  values: LongTermGoalFormValues,
  today: LocalDate,
): LongTermGoalFormResult {
  const renamed = renameLongTermGoal(goal, values.name);
  const changed = changeLongTermGoalAmounts(goal, amountsOf(goal.type, values));
  // The form of a goal that exists always has a deadline.
  const deadline = values.deadline ?? goal.deadline;
  const moved = changeLongTermGoalDeadline(goal, deadline, today);
  if (!renamed.ok || !changed.ok || !moved.ok) {
    return {
      ok: false,
      errors: [
        ...(renamed.ok ? [] : renamed.errors),
        ...(changed.ok ? [] : changed.errors),
        ...(moved.ok ? [] : moved.errors),
      ],
    };
  }
  return {
    ok: true,
    goal: {
      ...recolorLongTermGoal(renamed.value, values.color),
      ...amountsOnly(changed.value),
      deadline,
    },
  };
}

function amountsOnly({ target, unit, increment }: LongTermGoal) {
  return { target, unit, increment };
}

/** Whether an error is about the deadline, which has its own section in the form. */
export function isDeadlineError(
  error: LongTermGoalError,
): error is DeadlineError {
  return error.startsWith("deadline_");
}
