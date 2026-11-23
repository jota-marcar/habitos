// Reads and writes weekly goals, their versions and their totals in the local database
// (ADR-0022). Every write marks the row as pending synchronization; deleted rows are never
// returned.

import { localDate, type LocalDate } from "@/domain/dates";
import { parseHabitColor, type HabitType } from "@/domain/habits";
import type {
  WeeklyGoal,
  WeeklyGoalEntry,
  WeeklyGoalVersion,
} from "@/domain/weekly-goals";

import type { Database } from "./database";
import { markDeleted } from "./emptied-rows";

interface WeeklyGoalRow {
  id: string;
  name: string;
  type: string;
  color: string | null;
  recurring: number;
  first_week: string;
  archived_week: string | null;
}

interface WeeklyGoalVersionRow {
  id: string;
  weekly_goal_id: string;
  effective_from: string;
  target: number | null;
  unit: string | null;
  increment: number | null;
}

interface WeeklyGoalEntryRow {
  id: string;
  weekly_goal_id: string;
  week: string;
  value: number;
}

function toWeeklyGoal(row: WeeklyGoalRow): WeeklyGoal {
  return {
    id: row.id,
    name: row.name,
    // The table only admits the two types.
    type: row.type as HabitType,
    // A key this version does not know is read as no color (ADR-0014).
    color: parseHabitColor(row.color),
    recurring: row.recurring === 1,
    firstWeek: localDate(row.first_week),
    archivedWeek:
      row.archived_week === null ? null : localDate(row.archived_week),
  };
}

function toWeeklyGoalVersion(row: WeeklyGoalVersionRow): WeeklyGoalVersion {
  return {
    id: row.id,
    weeklyGoalId: row.weekly_goal_id,
    effectiveFrom: localDate(row.effective_from),
    target: row.target,
    unit: row.unit,
    increment: row.increment,
  };
}

function toWeeklyGoalEntry(row: WeeklyGoalEntryRow): WeeklyGoalEntry {
  return {
    id: row.id,
    weeklyGoalId: row.weekly_goal_id,
    week: localDate(row.week),
    value: row.value,
  };
}

/** Every goal, archived ones included, from the oldest to the newest. */
export async function listWeeklyGoals(db: Database): Promise<WeeklyGoal[]> {
  const rows = await db.all<WeeklyGoalRow>(
    `SELECT id, name, type, color, recurring, first_week, archived_week
       FROM weekly_goals
      WHERE deleted = 0
      ORDER BY first_week, rowid`,
  );
  return rows.map(toWeeklyGoal);
}

/** The versions of every goal, each goal's from the oldest to the newest. */
export async function listWeeklyGoalVersions(
  db: Database,
): Promise<WeeklyGoalVersion[]> {
  const rows = await db.all<WeeklyGoalVersionRow>(
    `SELECT id, weekly_goal_id, effective_from, target, unit, increment
       FROM weekly_goal_versions
      WHERE deleted = 0
      ORDER BY weekly_goal_id, effective_from`,
  );
  return rows.map(toWeeklyGoalVersion);
}

/** The totals of the week that starts on the Monday `week`. */
export async function listWeeklyGoalEntries(
  db: Database,
  week: LocalDate,
): Promise<WeeklyGoalEntry[]> {
  const rows = await db.all<WeeklyGoalEntryRow>(
    `SELECT id, weekly_goal_id, week, value
       FROM weekly_goal_entries
      WHERE deleted = 0 AND week = ?
      ORDER BY rowid`,
    [week],
  );
  return rows.map(toWeeklyGoalEntry);
}

/**
 * Creates a goal or updates what can change in it: its name, color and archived week. Its type,
 * whether it repeats and its first week never change (RF-42).
 */
export async function saveWeeklyGoal(
  db: Database,
  goal: WeeklyGoal,
): Promise<void> {
  await db.run(
    `INSERT INTO weekly_goals
       (id, name, type, color, recurring, first_week, archived_week)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       archived_week = excluded.archived_week,
       pending_sync = 1`,
    [
      goal.id,
      goal.name,
      goal.type,
      goal.color,
      goal.recurring ? 1 : 0,
      goal.firstWeek,
      goal.archivedWeek,
    ],
  );
}

/** Creates a version or updates its amounts. */
export async function saveWeeklyGoalVersion(
  db: Database,
  version: WeeklyGoalVersion,
): Promise<void> {
  await db.run(
    `INSERT INTO weekly_goal_versions
       (id, weekly_goal_id, effective_from, target, unit, increment)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       target = excluded.target,
       unit = excluded.unit,
       increment = excluded.increment,
       pending_sync = 1`,
    [
      version.id,
      version.weeklyGoalId,
      version.effectiveFrom,
      version.target,
      version.unit,
      version.increment,
    ],
  );
}

/** Saves a new goal together with its first version: both, or neither. */
export async function addWeeklyGoal(
  db: Database,
  goal: WeeklyGoal,
  version: WeeklyGoalVersion,
): Promise<void> {
  await db.transaction(async (tx) => {
    await saveWeeklyGoal(tx, goal);
    await saveWeeklyGoalVersion(tx, version);
  });
}

/**
 * Saves the changes made to a goal when editing it (RF-43): the goal and the version added or
 * updated, if the amounts changed. Both, or neither.
 */
export async function saveWeeklyGoalChanges(
  db: Database,
  goal: WeeklyGoal,
  version: WeeklyGoalVersion | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await saveWeeklyGoal(tx, goal);
    if (version !== null) await saveWeeklyGoalVersion(tx, version);
  });
}

/**
 * Records the total of a goal in a week. There is one per goal and week: if there is already
 * one, its value is replaced and it keeps its identifier (RF-47).
 */
export async function saveWeeklyGoalEntry(
  db: Database,
  entry: WeeklyGoalEntry,
): Promise<void> {
  await db.run(
    `INSERT INTO weekly_goal_entries (id, weekly_goal_id, week, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (weekly_goal_id, week) WHERE deleted = 0 DO UPDATE SET
       value = excluded.value,
       pending_sync = 1`,
    [entry.id, entry.weeklyGoalId, entry.week, entry.value],
  );
}

/**
 * Deletes a goal with all its history (RF-45). Only an empty marker of each row stays, so that
 * the synchronization can propagate it (ADR-0004, ADR-0023).
 */
export async function deleteWeeklyGoal(
  db: Database,
  goalId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await markDeleted(tx, "weekly_goals", "id = ?", [goalId]);
    for (const table of [
      "weekly_goal_versions",
      "weekly_goal_entries",
    ] as const) {
      await markDeleted(tx, table, "weekly_goal_id = ? AND deleted = 0", [
        goalId,
      ]);
    }
  });
}
