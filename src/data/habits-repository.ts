// Reads and writes habits and the versions of their configuration in the local database.
// Every write marks the row as pending synchronization; deleted rows are never returned.

import { localDate } from "@/domain/dates";
import type { Habit, HabitType, HabitVersion } from "@/domain/habits";
import type { Reminder } from "@/domain/reminders";

import type { Database } from "./database";
import { addReminder } from "./reminders-repository";

interface HabitRow {
  id: string;
  name: string;
  type: string;
  created_on: string;
  archived_on: string | null;
}

interface HabitVersionRow {
  id: string;
  habit_id: string;
  effective_from: string;
  scheduled_days: number;
  target: number | null;
  unit: string | null;
  increment: number | null;
}

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    // The table only admits the two types.
    type: row.type as HabitType,
    createdOn: localDate(row.created_on),
    archivedOn: row.archived_on === null ? null : localDate(row.archived_on),
  };
}

function toHabitVersion(row: HabitVersionRow): HabitVersion {
  return {
    id: row.id,
    habitId: row.habit_id,
    effectiveFrom: localDate(row.effective_from),
    scheduledDays: row.scheduled_days,
    target: row.target,
    unit: row.unit,
    increment: row.increment,
  };
}

/** Every habit, archived ones included, from the oldest to the newest. */
export async function listHabits(db: Database): Promise<Habit[]> {
  const rows = await db.all<HabitRow>(
    `SELECT id, name, type, created_on, archived_on
       FROM habits
      WHERE deleted = 0
      ORDER BY created_on, rowid`,
  );
  return rows.map(toHabit);
}

/** The versions of every habit, each habit's from the oldest to the newest. */
export async function listHabitVersions(db: Database): Promise<HabitVersion[]> {
  const rows = await db.all<HabitVersionRow>(
    `SELECT id, habit_id, effective_from, scheduled_days, target, unit, increment
       FROM habit_versions
      WHERE deleted = 0
      ORDER BY habit_id, effective_from`,
  );
  return rows.map(toHabitVersion);
}

/** Creates a habit or updates what can change in it: its name and its archive date. */
export async function saveHabit(db: Database, habit: Habit): Promise<void> {
  await db.run(
    `INSERT INTO habits (id, name, type, created_on, archived_on)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       archived_on = excluded.archived_on,
       pending_sync = 1`,
    [habit.id, habit.name, habit.type, habit.createdOn, habit.archivedOn],
  );
}

/** Creates a version or updates its configuration. */
export async function saveHabitVersion(
  db: Database,
  version: HabitVersion,
): Promise<void> {
  await db.run(
    `INSERT INTO habit_versions
       (id, habit_id, effective_from, scheduled_days, target, unit, increment)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       scheduled_days = excluded.scheduled_days,
       target = excluded.target,
       unit = excluded.unit,
       increment = excluded.increment,
       pending_sync = 1`,
    [
      version.id,
      version.habitId,
      version.effectiveFrom,
      version.scheduledDays,
      version.target,
      version.unit,
      version.increment,
    ],
  );
}

/**
 * Saves a new habit together with its first version and its reminders: all of them, or none.
 * The reminders belong to `habit`.
 */
export async function addHabit(
  db: Database,
  habit: Habit,
  version: HabitVersion,
  reminders: readonly Reminder[] = [],
): Promise<void> {
  await db.transaction(async () => {
    await saveHabit(db, habit);
    await saveHabitVersion(db, version);
    for (const reminder of reminders) {
      await addReminder(db, reminder);
    }
  });
}

/**
 * Deletes a habit with all its history (RF-11). The rows are only marked as deleted, so that
 * the synchronization can propagate it (ADR-0004).
 */
export async function deleteHabit(
  db: Database,
  habitId: string,
): Promise<void> {
  const mark = "SET deleted = 1, pending_sync = 1";
  await db.transaction(async () => {
    await db.run(`UPDATE habits ${mark} WHERE id = ?`, [habitId]);
    for (const table of ["habit_versions", "entries", "reminders"]) {
      await db.run(
        `UPDATE ${table} ${mark} WHERE habit_id = ? AND deleted = 0`,
        [habitId],
      );
    }
  });
}
