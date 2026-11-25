// Habits and the versions of their configuration.
// The identity of a habit (name, type, start and archive dates) is separate from its
// configuration, which is versioned with an effective date so that changes only apply from
// today onwards and past days keep what was due then (RF-09, ADR-0006).

import { later, type LocalDate } from "./dates";
import { fail, ok, type Result } from "./result";
import {
  EVERY_DAY,
  NO_DAYS,
  isValidScheduledDays,
  type ScheduledDays,
} from "./schedule";
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
import { versionOn } from "./versions";

export interface Habit {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the habit is created (RF-06). */
  readonly type: TrackedType;
  /** Not versioned, like the name: it changes in the whole history (ADR-0014). */
  readonly color: TrackedColor | null;
  /**
   * The first day the habit is due: the day it was created, or a later one if it was created
   * from a future day (RF-06).
   */
  readonly createdOn: LocalDate;
  readonly archivedOn: LocalDate | null;
}

/** The part of a habit that is versioned. */
export interface HabitConfig extends Amounts {
  readonly scheduledDays: ScheduledDays;
}

export interface HabitVersion extends HabitConfig {
  readonly id: string;
  readonly habitId: string;
  readonly effectiveFrom: LocalDate;
}

export type HabitError =
  NameError | AmountsError | "scheduled_days_invalid" | "scheduled_days_empty";

export const DEFAULT_SCHEDULED_DAYS: ScheduledDays = EVERY_DAY;
function validateConfig(type: TrackedType, config: HabitConfig): HabitError[] {
  const errors: HabitError[] = [];

  if (!isValidScheduledDays(config.scheduledDays)) {
    errors.push("scheduled_days_invalid");
  } else if (config.scheduledDays === NO_DAYS) {
    errors.push("scheduled_days_empty");
  }

  errors.push(...validateAmounts(type, config));
  return errors;
}

function normalizeConfig(config: HabitConfig): HabitConfig {
  return { scheduledDays: config.scheduledDays, ...normalizeAmounts(config) };
}

function sameConfig(a: HabitConfig, b: HabitConfig): boolean {
  return (
    a.scheduledDays === b.scheduledDays &&
    a.target === b.target &&
    a.unit === b.unit &&
    a.increment === b.increment
  );
}

export interface NewHabit {
  readonly name: string;
  readonly type: TrackedType;
  readonly color: TrackedColor | null;
  readonly config: HabitConfig;
}

/**
 * The day a habit created while `shown` is on screen starts (RF-06): that day if it is in the
 * future, so that habits can be planned ahead; today otherwise, since a habit does not start in
 * the past.
 */
export function startOfNewHabit(shown: LocalDate, today: LocalDate): LocalDate {
  return later(shown, today);
}

/**
 * Creates a habit and its first version, effective from the day it starts (RF-06), which
 * `startOfNewHabit` gives. The identifiers are generated outside the domain.
 */
export function createHabit(
  input: NewHabit,
  ids: { readonly habitId: string; readonly versionId: string },
  startsOn: LocalDate,
): Result<{ habit: Habit; version: HabitVersion }, HabitError> {
  const errors = [
    ...validateName(input.name),
    ...validateConfig(input.type, input.config),
  ];
  if (errors.length > 0) return fail(errors);

  const habit: Habit = {
    id: ids.habitId,
    name: input.name.trim(),
    type: input.type,
    color: input.color,
    createdOn: startsOn,
    archivedOn: null,
  };
  const version: HabitVersion = {
    ...normalizeConfig(input.config),
    id: ids.versionId,
    habitId: habit.id,
    effectiveFrom: startsOn,
  };
  return ok({ habit, version });
}

/** Renames a habit. The name is not versioned: it changes in the whole history (ADR-0006). */
export function renameHabit(
  habit: Habit,
  name: string,
): Result<Habit, HabitError> {
  const errors = validateName(name);
  if (errors.length > 0) return fail(errors);
  return ok({ ...habit, name: name.trim() });
}

/** Gives a habit another color, or none. Like the name, it is not versioned (ADR-0014). */
export function recolorHabit(habit: Habit, color: TrackedColor | null): Habit {
  return { ...habit, color };
}

/** Archives a habit as of today (RF-10). Archiving an archived habit changes nothing. */
export function archiveHabit(habit: Habit, today: LocalDate): Habit {
  return habit.archivedOn === null ? { ...habit, archivedOn: today } : habit;
}

/**
 * The day from which the changes made today to a habit apply (RF-09): today, or the day the
 * habit starts if it has not started yet.
 */
export function changesApplyFrom(habit: Habit, today: LocalDate): LocalDate {
  return later(habit.createdOn, today);
}

/**
 * Changes the configuration of a habit from today onwards, or from the day it starts if it has
 * not started yet (RF-09), and returns all its versions. If there is already a version
 * effective that day it is updated; otherwise a new one is added. Past days keep their
 * versions. `versions` belong to `habit`.
 */
export function changeConfig(
  habit: Habit,
  versions: readonly HabitVersion[],
  config: HabitConfig,
  newVersionId: string,
  today: LocalDate,
): Result<readonly HabitVersion[], HabitError> {
  const errors = validateConfig(habit.type, config);
  if (errors.length > 0) return fail(errors);

  const next = normalizeConfig(config);
  const from = changesApplyFrom(habit, today);
  const current = versionOn(versions, from);
  if (current !== null && sameConfig(current, next)) return ok(versions);

  if (current !== null && current.effectiveFrom === from) {
    const updated: HabitVersion = { ...current, ...next };
    return ok(versions.map((v) => (v.id === current.id ? updated : v)));
  }

  const added: HabitVersion = {
    ...next,
    id: newVersionId,
    habitId: habit.id,
    effectiveFrom: from,
  };
  return ok([...versions, added]);
}
