// The state of the form of a weekly goal and its conversion into a new goal (RF-42) or into the
// changes to an existing one (RF-43). The rules are the domain's: this only turns what the user
// typed into its input.

import { parseAmount } from "@/domain/amounts";
import type { LocalDate } from "@/domain/dates";
import {
  DEFAULT_INCREMENT,
  type Amounts,
  type HabitColor,
  type HabitType,
} from "@/domain/habits";
import {
  changeWeeklyGoalAmounts,
  createWeeklyGoal,
  recolorWeeklyGoal,
  renameWeeklyGoal,
  type WeeklyGoal,
  type WeeklyGoalError,
  type WeeklyGoalVersion,
} from "@/domain/weekly-goals";
import { weekOf } from "@/domain/weeks";

import { formatAmount, formatWeekRange } from "./format";

export interface WeeklyGoalFormValues {
  readonly name: string;
  readonly color: HabitColor | null;
  readonly type: HabitType;
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
  readonly recurring: boolean;
}

export const EMPTY_WEEKLY_GOAL_FORM: WeeklyGoalFormValues = {
  name: "",
  color: null,
  type: "boolean",
  target: "",
  unit: "",
  increment: formatAmount(DEFAULT_INCREMENT),
  // On by default: a goal left like this comes back into view instead of going away (RF-42).
  recurring: true,
};

// The amounts of a yes-or-no goal are ignored, even if they were typed before changing the type.
function amountsOf(type: HabitType, values: WeeklyGoalFormValues): Amounts {
  const quantitative = type === "quantitative";
  return {
    // Text that is not a number is rejected like a missing amount.
    target: quantitative ? parseAmount(values.target) : null,
    unit: quantitative ? values.unit : null,
    increment: quantitative ? parseAmount(values.increment) : null,
  };
}

export type WeeklyGoalFormResult =
  | {
      readonly ok: true;
      readonly goal: WeeklyGoal;
      readonly version: WeeklyGoalVersion;
    }
  | { readonly ok: false; readonly errors: readonly WeeklyGoalError[] };

/** Builds a new goal and its first version from the form, starting in `firstWeek` (RF-42). */
export function buildWeeklyGoal(
  values: WeeklyGoalFormValues,
  newId: () => string,
  firstWeek: LocalDate,
): WeeklyGoalFormResult {
  const result = createWeeklyGoal(
    {
      name: values.name,
      type: values.type,
      color: values.color,
      recurring: values.recurring,
      amounts: amountsOf(values.type, values),
    },
    { goalId: newId(), versionId: newId() },
    firstWeek,
  );
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, ...result.value };
}

/** The form filled in with a goal and the version the changes replace (RF-43). */
export function weeklyGoalFormOf(
  goal: WeeklyGoal,
  version: WeeklyGoalVersion,
): WeeklyGoalFormValues {
  const amount = (value: number | null, missing: string) =>
    value === null ? missing : formatAmount(value);
  return {
    name: goal.name,
    color: goal.color,
    type: goal.type,
    target: amount(version.target, EMPTY_WEEKLY_GOAL_FORM.target),
    unit: version.unit ?? EMPTY_WEEKLY_GOAL_FORM.unit,
    increment: amount(version.increment, EMPTY_WEEKLY_GOAL_FORM.increment),
    recurring: goal.recurring,
  };
}

export type WeeklyGoalChangesResult =
  | {
      readonly ok: true;
      readonly goal: WeeklyGoal;
      /** The version added or updated, if the amounts changed. */
      readonly version: WeeklyGoalVersion | null;
    }
  | { readonly ok: false; readonly errors: readonly WeeklyGoalError[] };

/**
 * Builds the changes to a goal from the form (RF-43). The name and the color change in the whole
 * history; the amounts, from the current week or from its first week. The type and the
 * repetition stay as they were, whatever the form says.
 */
export function buildWeeklyGoalChanges(
  stored: {
    readonly goal: WeeklyGoal;
    readonly versions: readonly WeeklyGoalVersion[];
  },
  values: WeeklyGoalFormValues,
  newId: () => string,
  today: LocalDate,
): WeeklyGoalChangesResult {
  const { goal, versions } = stored;
  const renamed = renameWeeklyGoal(goal, values.name);
  const changed = changeWeeklyGoalAmounts(
    goal,
    versions,
    amountsOf(goal.type, values),
    newId(),
    today,
  );
  if (!renamed.ok || !changed.ok) {
    return {
      ok: false,
      errors: [
        ...(renamed.ok ? [] : renamed.errors),
        ...(changed.ok ? [] : changed.errors),
      ],
    };
  }
  return {
    ok: true,
    goal: recolorWeeklyGoal(renamed.value, values.color),
    // The domain returns the same versions when nothing changed.
    version: changed.value.find((v) => !versions.includes(v)) ?? null,
  };
}

/** The discreet line that says what will happen with the goal being created (RF-42). */
export function repetitionNote(
  recurring: boolean,
  firstWeek: LocalDate,
  today: LocalDate,
): string {
  const range = formatWeekRange(weekOf(firstWeek), today);
  if (!recurring) return `Solo la semana del ${range}`;
  return firstWeek > weekOf(today).start
    ? `Se repite cada semana desde la del ${range}`
    : "Se repite cada semana";
}
