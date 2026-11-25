// Weekly goals: what the user wants to achieve in a whole week, whichever day it is done
// (RF-42 to RF-48, ADR-0022). Like a habit, a goal has an identity and a configuration with an
// effective date, but it is measured by the week: a single total per goal and week.
// Every week is identified by its Monday.

import type { LocalDate } from "./dates";
import { isDone } from "./day";
import { later } from "./dates";
import {
  normalizeAmounts,
  validateAmounts,
  validateName,
  type Amounts,
  type AmountsError,
  type TrackedColor,
  type TrackedType,
  type NameError,
} from "./tracked";
import { versionOn } from "./versions";
import { fail, ok, type Result } from "./result";
import { weekOf, type Week } from "./weeks";

export interface WeeklyGoal {
  readonly id: string;
  readonly name: string;
  /** Cannot change after the goal is created (RF-42). */
  readonly type: TrackedType;
  /** Not versioned, like the name: it changes in the whole history (RF-43). */
  readonly color: TrackedColor | null;
  /** Whether it repeats every week or is a one-off. Cannot change (RF-42). */
  readonly recurring: boolean;
  /** The Monday of its first week: the only one of a one-off goal. */
  readonly firstWeek: LocalDate;
  /** The Monday of the week it was archived. Only recurring goals are archived (RF-44). */
  readonly archivedWeek: LocalDate | null;
}

export interface WeeklyGoalVersion extends Amounts {
  readonly id: string;
  readonly weeklyGoalId: string;
  /** A Monday. */
  readonly effectiveFrom: LocalDate;
}

/** The total recorded for a goal in a week (RF-47). */
export interface WeeklyGoalEntry {
  readonly id: string;
  readonly weeklyGoalId: string;
  /** A Monday. */
  readonly week: LocalDate;
  readonly value: number;
}

export type WeeklyGoalError = NameError | AmountsError;

export interface NewWeeklyGoal {
  readonly name: string;
  readonly type: TrackedType;
  readonly color: TrackedColor | null;
  readonly recurring: boolean;
  readonly amounts: Amounts;
}

/**
 * The Monday of the first week of a goal created while the week of `shown` is on screen
 * (RF-42): that week if it is in the future, the current one otherwise.
 */
export function firstWeekOfNewGoal(
  shown: LocalDate,
  today: LocalDate,
): LocalDate {
  return later(weekOf(shown).start, weekOf(today).start);
}

/**
 * Creates a goal and its first version, effective from its first week, which
 * `firstWeekOfNewGoal` gives. The identifiers are generated outside the domain.
 */
export function createWeeklyGoal(
  input: NewWeeklyGoal,
  ids: { readonly goalId: string; readonly versionId: string },
  firstWeek: LocalDate,
): Result<{ goal: WeeklyGoal; version: WeeklyGoalVersion }, WeeklyGoalError> {
  const errors = [
    ...validateName(input.name),
    ...validateAmounts(input.type, input.amounts),
  ];
  if (errors.length > 0) return fail(errors);

  const goal: WeeklyGoal = {
    id: ids.goalId,
    name: input.name.trim(),
    type: input.type,
    color: input.color,
    recurring: input.recurring,
    firstWeek,
    archivedWeek: null,
  };
  const version: WeeklyGoalVersion = {
    ...normalizeAmounts(input.amounts),
    id: ids.versionId,
    weeklyGoalId: goal.id,
    effectiveFrom: firstWeek,
  };
  return ok({ goal, version });
}

/**
 * Whether a goal can still be edited (RF-43): an archived goal cannot, and neither can a
 * one-off goal whose week has passed.
 */
export function canEditWeeklyGoal(goal: WeeklyGoal, today: LocalDate): boolean {
  if (goal.archivedWeek !== null) return false;
  return goal.recurring || goal.firstWeek >= weekOf(today).start;
}

/** Renames a goal. The name is not versioned: it changes in the whole history (RF-43). */
export function renameWeeklyGoal(
  goal: WeeklyGoal,
  name: string,
): Result<WeeklyGoal, NameError> {
  const errors = validateName(name);
  if (errors.length > 0) return fail(errors);
  return ok({ ...goal, name: name.trim() });
}

/** Gives a goal another color, or none. Like the name, it is not versioned (RF-43). */
export function recolorWeeklyGoal(
  goal: WeeklyGoal,
  color: TrackedColor | null,
): WeeklyGoal {
  return { ...goal, color };
}

/**
 * Archives a recurring goal as of the current week (RF-44). A one-off goal ends with its week,
 * so it is not archived, and archiving an archived goal changes nothing.
 */
export function archiveWeeklyGoal(
  goal: WeeklyGoal,
  today: LocalDate,
): WeeklyGoal {
  if (!goal.recurring || goal.archivedWeek !== null) return goal;
  return { ...goal, archivedWeek: weekOf(today).start };
}

function sameAmounts(a: Amounts, b: Amounts): boolean {
  return (
    a.target === b.target && a.unit === b.unit && a.increment === b.increment
  );
}

/**
 * The Monday from which a change to the amounts of a goal applies (RF-43): the current week, or
 * its first week if it has not started.
 */
export function weeklyGoalChangesApplyFrom(
  goal: WeeklyGoal,
  today: LocalDate,
): LocalDate {
  return later(goal.firstWeek, weekOf(today).start);
}

/**
 * Changes the amounts of a goal from the current week onwards, or from its first week if it has
 * not started (RF-43), and returns all its versions. If there is already a version effective
 * that week it is updated; otherwise a new one is added. Past weeks keep their versions.
 * `versions` belong to `goal`, which must be editable (`canEditWeeklyGoal`).
 */
export function changeWeeklyGoalAmounts(
  goal: WeeklyGoal,
  versions: readonly WeeklyGoalVersion[],
  amounts: Amounts,
  newVersionId: string,
  today: LocalDate,
): Result<readonly WeeklyGoalVersion[], AmountsError> {
  const errors = validateAmounts(goal.type, amounts);
  if (errors.length > 0) return fail(errors);

  const next = normalizeAmounts(amounts);
  const from = weeklyGoalChangesApplyFrom(goal, today);
  const current = versionOn(versions, from);
  if (current !== null && sameAmounts(current, next)) return ok(versions);

  if (current !== null && current.effectiveFrom === from) {
    const updated: WeeklyGoalVersion = { ...current, ...next };
    return ok(versions.map((v) => (v.id === current.id ? updated : v)));
  }

  const added: WeeklyGoalVersion = {
    ...next,
    id: newVersionId,
    weeklyGoalId: goal.id,
    effectiveFrom: from,
  };
  return ok([...versions, added]);
}

/** A goal as it stands in a week. */
export interface WeekGoal {
  readonly goal: WeeklyGoal;
  /** The configuration in force that week, which may differ from the current one. */
  readonly version: WeeklyGoalVersion;
  /** The total recorded that week: 0 if there is nothing. */
  readonly value: number;
  readonly done: boolean;
}

// A one-off goal only has its week. A recurring one goes on until it is archived, and the week
// it was archived only shows it if it has an entry, so that no history is hidden. An entry
// brought back to 0 counts: if that hid the goal, it could not be recorded again (RF-44).
function appearsIn(
  goal: WeeklyGoal,
  monday: LocalDate,
  hasEntry: boolean,
): boolean {
  if (monday < goal.firstWeek) return false;
  if (!goal.recurring) return monday === goal.firstWeek;
  if (goal.archivedWeek === null || monday < goal.archivedWeek) return true;
  return monday === goal.archivedWeek && hasEntry;
}

/** The goals of `week`, in the order of `goals`, each with its total (RF-46). */
export function goalsForWeek(
  data: {
    readonly goals: readonly WeeklyGoal[];
    readonly versions: readonly WeeklyGoalVersion[];
    readonly entries: readonly WeeklyGoalEntry[];
  },
  week: Week,
): WeekGoal[] {
  const valueByGoal = new Map(
    data.entries
      .filter((entry) => entry.week === week.start)
      .map((entry) => [entry.weeklyGoalId, entry.value]),
  );

  const weekGoals: WeekGoal[] = [];
  for (const goal of data.goals) {
    if (!appearsIn(goal, week.start, valueByGoal.has(goal.id))) continue;
    const version = versionOn(
      data.versions.filter((v) => v.weeklyGoalId === goal.id),
      week.start,
    );
    if (version === null) continue;
    const value = valueByGoal.get(goal.id) ?? 0;
    weekGoals.push({
      goal,
      version,
      value,
      done: isDone(goal.type, version, value),
    });
  }
  return weekGoals;
}
