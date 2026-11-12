// The state of the habit form and its conversion into a new habit (RF-06).
// The rules are the domain's: this only turns what the user typed into its input.

import { parseAmount } from "@/domain/amounts";
import type { LocalDate } from "@/domain/dates";
import {
  DEFAULT_INCREMENT,
  DEFAULT_SCHEDULED_DAYS,
  createHabit,
  type Habit,
  type HabitError,
  type HabitType,
  type HabitVersion,
} from "@/domain/habits";
import {
  addReminder,
  type Reminder,
  type ReminderError,
} from "@/domain/reminders";
import type { Result } from "@/domain/result";
import type { LocalTime } from "@/domain/times";

import { formatAmount } from "./format";

export interface HabitFormValues {
  readonly name: string;
  readonly type: HabitType;
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
  readonly scheduledDays: number;
  readonly reminderTimes: readonly LocalTime[];
}

export const EMPTY_HABIT_FORM: HabitFormValues = {
  name: "",
  type: "boolean",
  target: "",
  unit: "",
  increment: formatAmount(DEFAULT_INCREMENT),
  scheduledDays: DEFAULT_SCHEDULED_DAYS,
  reminderTimes: [],
};

export type HabitFormResult =
  | {
      readonly ok: true;
      readonly habit: Habit;
      readonly version: HabitVersion;
      readonly reminders: readonly Reminder[];
    }
  | { readonly ok: false; readonly errors: readonly HabitError[] };

/**
 * Builds a new habit, its first version and its reminders from the form. The amounts of a
 * boolean habit are ignored, even if they were typed before changing the type.
 */
export function buildHabit(
  values: HabitFormValues,
  newId: () => string,
  today: LocalDate,
): HabitFormResult {
  const quantitative = values.type === "quantitative";
  const result = createHabit(
    {
      name: values.name,
      type: values.type,
      config: {
        scheduledDays: values.scheduledDays,
        // Text that is not a number is rejected like a missing amount.
        target: quantitative ? parseAmount(values.target) : null,
        unit: quantitative ? values.unit : null,
        increment: quantitative ? parseAmount(values.increment) : null,
      },
    },
    { habitId: newId(), versionId: newId() },
    today,
  );
  if (!result.ok) return { ok: false, errors: result.errors };

  const { habit, version } = result.value;
  const reminders = values.reminderTimes.map((time) => ({
    id: newId(),
    habitId: habit.id,
    time,
  }));
  return { ok: true, habit, version, reminders };
}

/** The form field each error belongs to, to show it next to it. */
export type HabitFormField = "name" | "amounts" | "scheduledDays";

export function fieldOf(error: HabitError): HabitFormField {
  if (error === "name_empty" || error === "name_too_long") return "name";
  if (error === "scheduled_days_empty" || error === "scheduled_days_invalid") {
    return "scheduledDays";
  }
  return "amounts";
}

/**
 * Adds a reminder time to the form and returns the times in order. A habit cannot have two
 * reminders at the same time (RF-22).
 */
export function addReminderTime(
  times: readonly LocalTime[],
  time: LocalTime,
): Result<readonly LocalTime[], ReminderError> {
  // The habit does not exist yet: the time is enough to identify each reminder.
  const asReminder = (t: LocalTime): Reminder => ({
    id: t,
    habitId: "",
    time: t,
  });
  const result = addReminder(times.map(asReminder), asReminder(time));
  if (!result.ok) return result;
  return { ok: true, value: result.value.map((r) => r.time).sort() };
}
