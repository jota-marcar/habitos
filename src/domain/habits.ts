// Habits and the versions of their configuration.
// The identity of a habit (name, type, creation and archive dates) is separate from its
// configuration, which is versioned with an effective date so that changes only apply from
// today onwards and past days keep what was due then (RF-09, ADR-0006).

import { isAmount } from "./amounts";
import type { LocalDate } from "./dates";
import { fail, ok, type Result } from "./result";
import {
  EVERY_DAY,
  NO_DAYS,
  isValidScheduledDays,
  type ScheduledDays,
} from "./schedule";

export type HabitType = "boolean" | "quantitative";

export interface Habit {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the habit is created (RF-06). */
  readonly type: HabitType;
  readonly createdOn: LocalDate;
  readonly archivedOn: LocalDate | null;
}

/** The part of a habit that is versioned. Amounts are null in boolean habits. */
export interface HabitConfig {
  readonly scheduledDays: ScheduledDays;
  readonly target: number | null;
  readonly unit: string | null;
  readonly increment: number | null;
}

export interface HabitVersion extends HabitConfig {
  readonly id: string;
  readonly habitId: string;
  readonly effectiveFrom: LocalDate;
}

export type HabitError =
  | "name_empty"
  | "name_too_long"
  | "scheduled_days_invalid"
  | "scheduled_days_empty"
  | "amounts_not_allowed"
  | "target_not_positive"
  | "target_too_precise"
  | "unit_empty"
  | "unit_too_long"
  | "increment_not_positive"
  | "increment_too_precise";

export const DEFAULT_SCHEDULED_DAYS: ScheduledDays = EVERY_DAY;
export const DEFAULT_INCREMENT = 1;

/** Longest name and unit, in characters, without surrounding spaces (RF-06). */
export const MAX_NAME_LENGTH = 40;
export const MAX_UNIT_LENGTH = 10;

// Counts characters as the user sees them, so that an emoji counts as one.
function lengthOf(text: string): number {
  return [...text.trim()].length;
}

function validateName(name: string): HabitError[] {
  if (name.trim() === "") return ["name_empty"];
  return lengthOf(name) > MAX_NAME_LENGTH ? ["name_too_long"] : [];
}

function validateAmount(
  value: number | null,
  notPositive: HabitError,
  tooPrecise: HabitError,
): HabitError[] {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return [notPositive];
  }
  return isAmount(value) ? [] : [tooPrecise];
}

function validateConfig(type: HabitType, config: HabitConfig): HabitError[] {
  const errors: HabitError[] = [];

  if (!isValidScheduledDays(config.scheduledDays)) {
    errors.push("scheduled_days_invalid");
  } else if (config.scheduledDays === NO_DAYS) {
    errors.push("scheduled_days_empty");
  }

  if (type === "boolean") {
    const hasAmounts =
      config.target !== null ||
      config.unit !== null ||
      config.increment !== null;
    if (hasAmounts) errors.push("amounts_not_allowed");
    return errors;
  }

  errors.push(
    ...validateAmount(
      config.target,
      "target_not_positive",
      "target_too_precise",
    ),
  );
  if (config.unit === null || config.unit.trim() === "") {
    errors.push("unit_empty");
  } else if (lengthOf(config.unit) > MAX_UNIT_LENGTH) {
    errors.push("unit_too_long");
  }
  errors.push(
    ...validateAmount(
      config.increment,
      "increment_not_positive",
      "increment_too_precise",
    ),
  );
  return errors;
}

// Stores the unit without surrounding spaces.
function normalizeConfig(config: HabitConfig): HabitConfig {
  return {
    scheduledDays: config.scheduledDays,
    target: config.target,
    unit: config.unit === null ? null : config.unit.trim(),
    increment: config.increment,
  };
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
  readonly type: HabitType;
  readonly config: HabitConfig;
}

/**
 * Creates a habit and its first version, effective from the day it is created (RF-06).
 * The identifiers are generated outside the domain.
 */
export function createHabit(
  input: NewHabit,
  ids: { readonly habitId: string; readonly versionId: string },
  today: LocalDate,
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
    createdOn: today,
    archivedOn: null,
  };
  const version: HabitVersion = {
    ...normalizeConfig(input.config),
    id: ids.versionId,
    habitId: habit.id,
    effectiveFrom: today,
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

/** Archives a habit as of today (RF-10). Archiving an archived habit changes nothing. */
export function archiveHabit(habit: Habit, today: LocalDate): Habit {
  return habit.archivedOn === null ? { ...habit, archivedOn: today } : habit;
}

/**
 * The version in force on `date`: the one with the latest `effectiveFrom` that is not after
 * `date`, or null if the habit had no configuration yet. `versions` belong to a single habit.
 */
export function versionOn(
  versions: readonly HabitVersion[],
  date: LocalDate,
): HabitVersion | null {
  let current: HabitVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFrom > date) continue;
    if (current === null || version.effectiveFrom > current.effectiveFrom) {
      current = version;
    }
  }
  return current;
}

/**
 * Changes the configuration of a habit from today onwards (RF-09) and returns all its versions.
 * If there is already a version effective today it is updated; otherwise a new one is added.
 * Past days keep their versions. `versions` belong to `habit`.
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
  const current = versionOn(versions, today);
  if (current !== null && sameConfig(current, next)) return ok(versions);

  if (current !== null && current.effectiveFrom === today) {
    const updated: HabitVersion = { ...current, ...next };
    return ok(versions.map((v) => (v.id === current.id ? updated : v)));
  }

  const added: HabitVersion = {
    ...next,
    id: newVersionId,
    habitId: habit.id,
    effectiveFrom: today,
  };
  return ok([...versions, added]);
}
