// The state of the habit form and its conversion into a new habit (RF-06) or into the changes
// to an existing one (RF-08). The rules are the domain's: this only turns what the user typed
// into its input.

import type { HabitChanges } from "@/data/habits-repository";
import type { LocalDate } from "@/domain/dates";
import {
  DEFAULT_SCHEDULED_DAYS,
  changeConfig,
  createHabit,
  recolorHabit,
  renameHabit,
  type Habit,
  type HabitError,
  type HabitVersion,
} from "@/domain/habits";
import type { TrackedColor } from "@/domain/tracked";
import {
  addReminder,
  type Reminder,
  type ReminderError,
} from "@/domain/reminders";
import type { Result } from "@/domain/result";
import type { LocalTime } from "@/domain/times";

import {
  EMPTY_AMOUNTS,
  amountValuesOf,
  amountsOf,
  type AmountValues,
} from "./amounts-form";

export interface HabitFormValues extends AmountValues {
  readonly name: string;
  readonly color: TrackedColor | null;
  readonly scheduledDays: number;
  readonly reminderTimes: readonly LocalTime[];
}

export const EMPTY_HABIT_FORM: HabitFormValues = {
  ...EMPTY_AMOUNTS,
  name: "",
  color: null,
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
 * Builds a new habit, its first version and its reminders from the form, starting on
 * `startsOn` (RF-06).
 */
export function buildHabit(
  values: HabitFormValues,
  newId: () => string,
  startsOn: LocalDate,
): HabitFormResult {
  const result = createHabit(
    {
      name: values.name,
      type: values.type,
      color: values.color,
      config: {
        scheduledDays: values.scheduledDays,
        ...amountsOf(values.type, values),
      },
    },
    { habitId: newId(), versionId: newId() },
    startsOn,
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

/** A habit as it is stored, with the versions and the reminders that belong to it. */
export interface StoredHabit {
  readonly habit: Habit;
  readonly versions: readonly HabitVersion[];
  readonly reminders: readonly Reminder[];
}

/**
 * The form filled in with a habit and the version to edit: the one the changes replace, in
 * force today or on the day the habit starts if it has not started yet (RF-09).
 */
export function habitFormOf(
  habit: Habit,
  version: HabitVersion,
  reminders: readonly Reminder[],
): HabitFormValues {
  return {
    ...amountValuesOf(habit.type, version),
    name: habit.name,
    color: habit.color,
    scheduledDays: version.scheduledDays,
    reminderTimes: reminders.map((reminder) => reminder.time).sort(),
  };
}

export type HabitChangesResult =
  | { readonly ok: true; readonly changes: HabitChanges }
  | { readonly ok: false; readonly errors: readonly HabitError[] };

/**
 * Builds the changes to a habit from the form (RF-08). The name and the color change in the
 * whole history; the configuration, from today onwards or from the day the habit starts
 * (RF-09); and the type stays as it was, whatever the form says (RF-06). Only the reminders
 * whose time was added or removed change.
 */
export function buildHabitChanges(
  stored: StoredHabit,
  values: HabitFormValues,
  newId: () => string,
  today: LocalDate,
): HabitChangesResult {
  const { habit, versions, reminders } = stored;
  const renamed = renameHabit(habit, values.name);
  const configured = changeConfig(
    habit,
    versions,
    {
      scheduledDays: values.scheduledDays,
      ...amountsOf(habit.type, values),
    },
    newId(),
    today,
  );
  if (!renamed.ok || !configured.ok) {
    return {
      ok: false,
      errors: [
        ...(renamed.ok ? [] : renamed.errors),
        ...(configured.ok ? [] : configured.errors),
      ],
    };
  }

  const times = values.reminderTimes;
  return {
    ok: true,
    changes: {
      habit: recolorHabit(renamed.value, values.color),
      // The domain returns the same versions when nothing changed.
      version: configured.value.find((v) => !versions.includes(v)) ?? null,
      addedReminders: times
        .filter((time) => !reminders.some((r) => r.time === time))
        .map((time) => ({ id: newId(), habitId: habit.id, time })),
      removedReminderIds: reminders
        .filter((r) => !times.includes(r.time))
        .map((r) => r.id),
    },
  };
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

/**
 * The form as it is saved: the time still open in the picker counts as chosen, so that what the
 * user sees is what is saved (RF-22). If the habit already has that time, nothing changes.
 */
export function withPickedTime(
  values: HabitFormValues,
  picked: LocalTime | null,
): HabitFormValues {
  if (picked === null) return values;
  const result = addReminderTime(values.reminderTimes, picked);
  return result.ok ? { ...values, reminderTimes: result.value } : values;
}
