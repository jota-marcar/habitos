// Habits and the versions of their configuration.
// The identity of a habit (name, type, start and archive dates) is separate from its
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

/**
 * The colors a habit can be given to tell it apart from others (RF-06). They are the keys of
 * a palette: the interface decides the tone of each one (ADR-0014).
 */
export const HABIT_COLORS = [
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "violet",
  "fuchsia",
  "pink",
  "gray",
] as const;

export type HabitColor = (typeof HABIT_COLORS)[number];

/**
 * The color with the key `text`, or null if there is none: a habit without a color, or a key
 * of a palette this version does not know (ADR-0014).
 */
export function parseHabitColor(text: string | null): HabitColor | null {
  return HABIT_COLORS.find((color) => color === text) ?? null;
}

export interface Habit {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the habit is created (RF-06). */
  readonly type: HabitType;
  /** Not versioned, like the name: it changes in the whole history (ADR-0014). */
  readonly color: HabitColor | null;
  /**
   * The first day the habit is due: the day it was created, or a later one if it was created
   * from a future day (RF-06).
   */
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

export type NameError = "name_empty" | "name_too_long";

export type AmountsError =
  | "amounts_not_allowed"
  | "target_not_positive"
  | "target_too_precise"
  | "unit_empty"
  | "unit_too_long"
  | "increment_not_positive"
  | "increment_too_precise";

export type HabitError =
  NameError | "scheduled_days_invalid" | "scheduled_days_empty" | AmountsError;

/** The amounts of a habit or a task. They are null when it is boolean. */
export type Amounts = Pick<HabitConfig, "target" | "unit" | "increment">;

export const DEFAULT_SCHEDULED_DAYS: ScheduledDays = EVERY_DAY;
export const DEFAULT_INCREMENT = 1;

/** Longest name and unit, in characters, without surrounding spaces (RF-06). */
export const MAX_NAME_LENGTH = 40;
export const MAX_UNIT_LENGTH = 10;

// Counts characters as the user sees them, so that an emoji counts as one.
function lengthOf(text: string): number {
  return [...text.trim()].length;
}

/** Checks the name of a habit or a task (RF-06, RF-40). */
export function validateName(name: string): NameError[] {
  if (name.trim() === "") return ["name_empty"];
  return lengthOf(name) > MAX_NAME_LENGTH ? ["name_too_long"] : [];
}

function validateAmount(
  value: number | null,
  notPositive: AmountsError,
  tooPrecise: AmountsError,
): AmountsError[] {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return [notPositive];
  }
  return isAmount(value) ? [] : [tooPrecise];
}

/** Checks the amounts of a habit or a task of type `type` (RF-06, RF-40). */
export function validateAmounts(
  type: HabitType,
  amounts: Amounts,
): AmountsError[] {
  if (type === "boolean") {
    const hasAmounts =
      amounts.target !== null ||
      amounts.unit !== null ||
      amounts.increment !== null;
    return hasAmounts ? ["amounts_not_allowed"] : [];
  }

  const errors: AmountsError[] = [
    ...validateAmount(
      amounts.target,
      "target_not_positive",
      "target_too_precise",
    ),
  ];
  if (amounts.unit === null || amounts.unit.trim() === "") {
    errors.push("unit_empty");
  } else if (lengthOf(amounts.unit) > MAX_UNIT_LENGTH) {
    errors.push("unit_too_long");
  }
  errors.push(
    ...validateAmount(
      amounts.increment,
      "increment_not_positive",
      "increment_too_precise",
    ),
  );
  return errors;
}

function validateConfig(type: HabitType, config: HabitConfig): HabitError[] {
  const errors: HabitError[] = [];

  if (!isValidScheduledDays(config.scheduledDays)) {
    errors.push("scheduled_days_invalid");
  } else if (config.scheduledDays === NO_DAYS) {
    errors.push("scheduled_days_empty");
  }

  errors.push(...validateAmounts(type, config));
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
  readonly color: HabitColor | null;
  readonly config: HabitConfig;
}

function later(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
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
export function recolorHabit(habit: Habit, color: HabitColor | null): Habit {
  return { ...habit, color };
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
