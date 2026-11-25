// Reads and writes long-term goals and their totals in the local database (ADR-0027). Every
// write marks the row as pending synchronization; deleted rows are never returned.

import { localDate } from "@/domain/dates";
import type { LongTermGoal, LongTermGoalEntry } from "@/domain/long-term-goals";
import { parseTrackedColor, type TrackedType } from "@/domain/tracked";

import type { Database } from "./database";
import { markDeleted } from "./emptied-rows";

interface LongTermGoalRow {
  id: string;
  name: string;
  type: string;
  color: string | null;
  target: number | null;
  unit: string | null;
  increment: number | null;
  first_day: string;
  deadline: string;
}

interface LongTermGoalEntryRow {
  id: string;
  long_term_goal_id: string;
  value: number;
}

function toLongTermGoal(row: LongTermGoalRow): LongTermGoal {
  return {
    id: row.id,
    name: row.name,
    // The table only admits the two types.
    type: row.type as TrackedType,
    // A key this version does not know is read as no color (ADR-0014).
    color: parseTrackedColor(row.color),
    target: row.target,
    unit: row.unit,
    increment: row.increment,
    firstDay: localDate(row.first_day),
    deadline: localDate(row.deadline),
  };
}

function toLongTermGoalEntry(row: LongTermGoalEntryRow): LongTermGoalEntry {
  return {
    id: row.id,
    longTermGoalId: row.long_term_goal_id,
    value: row.value,
  };
}

/** Every goal, ended ones included, in the order they were created on this device. */
export async function listLongTermGoals(db: Database): Promise<LongTermGoal[]> {
  const rows = await db.all<LongTermGoalRow>(
    `SELECT id, name, type, color, target, unit, increment, first_day, deadline
       FROM long_term_goals
      WHERE deleted = 0
      ORDER BY rowid`,
  );
  return rows.map(toLongTermGoal);
}

/** The totals of every goal: one per goal at most. */
export async function listLongTermGoalEntries(
  db: Database,
): Promise<LongTermGoalEntry[]> {
  const rows = await db.all<LongTermGoalEntryRow>(
    `SELECT id, long_term_goal_id, value
       FROM long_term_goal_entries
      WHERE deleted = 0
      ORDER BY rowid`,
  );
  return rows.map(toLongTermGoalEntry);
}

/**
 * Creates a goal or updates what can change in it (RF-56): everything but its type and its
 * first day.
 */
export async function saveLongTermGoal(
  db: Database,
  goal: LongTermGoal,
): Promise<void> {
  await db.run(
    `INSERT INTO long_term_goals
       (id, name, type, color, target, unit, increment, first_day, deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       target = excluded.target,
       unit = excluded.unit,
       increment = excluded.increment,
       deadline = excluded.deadline,
       pending_sync = 1`,
    [
      goal.id,
      goal.name,
      goal.type,
      goal.color,
      goal.target,
      goal.unit,
      goal.increment,
      goal.firstDay,
      goal.deadline,
    ],
  );
}

/**
 * Records the total of a goal. There is one per goal: if there is already one, its value is
 * replaced and it keeps its identifier (RF-59).
 */
export async function saveLongTermGoalEntry(
  db: Database,
  entry: LongTermGoalEntry,
): Promise<void> {
  await db.run(
    `INSERT INTO long_term_goal_entries (id, long_term_goal_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT (long_term_goal_id) WHERE deleted = 0 DO UPDATE SET
       value = excluded.value,
       pending_sync = 1`,
    [entry.id, entry.longTermGoalId, entry.value],
  );
}

/**
 * Deletes a goal with its total (RF-57). Only an empty marker of each row stays, so that the
 * synchronization can propagate it (ADR-0004, ADR-0023).
 */
export async function deleteLongTermGoal(
  db: Database,
  goalId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await markDeleted(tx, "long_term_goals", "id = ?", [goalId]);
    await markDeleted(
      tx,
      "long_term_goal_entries",
      "long_term_goal_id = ? AND deleted = 0",
      [goalId],
    );
  });
}
