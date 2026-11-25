// Deleting is for good (RF-11, RF-45, ADR-0023): a deleted row stays only as the marker that the
// synchronization needs, without anything the user wrote or recorded.

import type { Database, SqlValue } from "./database";
import type { SyncTable } from "./sync-repository";

// The columns that cannot be null get a fixed value. It is a Monday, valid for a week too. A
// deadline has to be after the first day, so it is the day after.
const NO_DATE = "1970-01-05";
const NO_DEADLINE = "1970-01-06";
const NO_TIME = "00:00";
const NO_AMOUNTS = { target: null, unit: null, increment: null };
const ALL_DAYS = 127;

/**
 * What the columns of a deleted row hold. The account applies the same values with the trigger
 * `tombstone_deleted_row`, and a test of the CI checks that they match.
 */
export const EMPTIED_VALUES: Readonly<
  Record<SyncTable, Readonly<Record<string, SqlValue>>>
> = {
  habits: {
    name: "",
    type: "boolean",
    color: null,
    created_on: NO_DATE,
    archived_on: null,
  },
  habit_versions: {
    effective_from: NO_DATE,
    scheduled_days: ALL_DAYS,
    ...NO_AMOUNTS,
  },
  entries: { date: NO_DATE, value: 0 },
  reminders: { time: NO_TIME },
  weekly_goals: {
    name: "",
    type: "boolean",
    color: null,
    first_week: NO_DATE,
    archived_week: null,
  },
  weekly_goal_versions: { effective_from: NO_DATE, ...NO_AMOUNTS },
  weekly_goal_entries: { week: NO_DATE, value: 0 },
  long_term_goals: {
    name: "",
    type: "boolean",
    color: null,
    ...NO_AMOUNTS,
    first_day: NO_DATE,
    deadline: NO_DEADLINE,
  },
  long_term_goal_entries: { value: 0 },
};

/** Marks the rows of `table` that match `where` as deleted, and empties them. */
export async function markDeleted(
  db: Database,
  table: SyncTable,
  where: string,
  params: readonly SqlValue[],
): Promise<void> {
  const emptied = Object.entries(EMPTIED_VALUES[table]);
  const columns = emptied.map(([column]) => `${column} = ?`).join(", ");
  await db.run(
    `UPDATE ${table} SET deleted = 1, pending_sync = 1, ${columns} WHERE ${where}`,
    [...emptied.map(([, value]) => value), ...params],
  );
}
