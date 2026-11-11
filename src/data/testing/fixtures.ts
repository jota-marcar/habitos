// Shared helpers for the tests of the data layer.

import { localDate } from "@/domain/dates";
import type { Habit, HabitVersion } from "@/domain/habits";
import { EVERY_DAY } from "@/domain/schedule";

import { migrate } from "../migrations";
import { openTestDatabase, type TestDatabase } from "./node-database";

/** An in-memory database with the current schema. */
export async function openMigratedDatabase(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await migrate(db);
  return db;
}

export function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    type: "boolean",
    createdOn: localDate("2026-11-01"),
    archivedOn: null,
    ...overrides,
  };
}

export function version(
  habitId: string,
  overrides: Partial<HabitVersion> = {},
): HabitVersion {
  return {
    id: `${habitId}-v1`,
    habitId,
    effectiveFrom: localDate("2026-11-01"),
    scheduledDays: EVERY_DAY,
    target: null,
    unit: null,
    increment: null,
    ...overrides,
  };
}

interface SyncState {
  id: string;
  deleted: number;
  pending_sync: number;
  updated_at: string | null;
}

/** The synchronization columns of every row of `table`, deleted ones included. */
export function syncState(
  db: TestDatabase,
  table: string,
): Promise<SyncState[]> {
  return db.all<SyncState>(
    `SELECT id, deleted, pending_sync, updated_at FROM ${table} ORDER BY id`,
  );
}

/** Marks every row of `table` as uploaded, as the synchronization will do. */
export function markSynced(db: TestDatabase, table: string): Promise<void> {
  return db.run(
    `UPDATE ${table} SET pending_sync = 0, updated_at = '2026-11-11T10:00:00Z'`,
  );
}
