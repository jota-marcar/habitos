// What the synchronization reads and writes on the device (ADR-0004, ADR-0016, ADR-0018): the
// rows with changes to upload, the rows downloaded from the account, how far the download of
// each table has gone and which account the data on the device belong to.
// Rows travel in the format of the cloud: the same columns, with `deleted` as a boolean, and
// without the columns of the synchronization, which each side keeps on its own.

import { deleteAccountData } from "./account-data";
import type { Database, SqlValue } from "./database";

export type SyncTable =
  | "habits"
  | "habit_versions"
  | "entries"
  | "reminders"
  | "weekly_goals"
  | "weekly_goal_versions"
  | "weekly_goal_entries"
  | "long_term_goals"
  | "long_term_goal_entries";

/** The synchronized tables, parents before their children, as their foreign keys require. */
export const SYNC_TABLES: readonly SyncTable[] = [
  "habits",
  "habit_versions",
  "entries",
  "reminders",
  "weekly_goals",
  "weekly_goal_versions",
  "weekly_goal_entries",
  "long_term_goals",
  "long_term_goal_entries",
];

/** The value of a column in the cloud. */
export type CloudValue = string | number | boolean | null;

/** A row in the format of the cloud. The server assigns its user and its updated_at. */
export interface CloudRow {
  readonly id: string;
  readonly [column: string]: CloudValue;
}

/** A row downloaded from the cloud, with the time the server gave to its last change. */
export interface PulledRow extends CloudRow {
  readonly updated_at: string;
}

/** How far the download of a table has gone: its last row, in order of (updated_at, id). */
export interface Cursor {
  readonly updatedAt: string;
  readonly id: string;
}

/** The columns that travel, in both directions. A test checks them against the schema. */
const COLUMNS: Record<SyncTable, readonly string[]> = {
  habits: [
    "id",
    "name",
    "type",
    "color",
    "created_on",
    "archived_on",
    "deleted",
  ],
  habit_versions: [
    "id",
    "habit_id",
    "effective_from",
    "scheduled_days",
    "target",
    "unit",
    "increment",
    "deleted",
  ],
  entries: ["id", "habit_id", "date", "value", "deleted"],
  reminders: ["id", "habit_id", "time", "deleted"],
  weekly_goals: [
    "id",
    "name",
    "type",
    "color",
    "recurring",
    "first_week",
    "archived_week",
    "deleted",
  ],
  weekly_goal_versions: [
    "id",
    "weekly_goal_id",
    "effective_from",
    "target",
    "unit",
    "increment",
    "deleted",
  ],
  weekly_goal_entries: ["id", "weekly_goal_id", "week", "value", "deleted"],
  long_term_goals: [
    "id",
    "name",
    "type",
    "color",
    "target",
    "unit",
    "increment",
    "first_day",
    "deadline",
    "deleted",
  ],
  long_term_goal_entries: ["id", "long_term_goal_id", "value", "deleted"],
};

/** The columns that are 0 or 1 on the device and a boolean in the cloud. */
const BOOLEAN_COLUMNS: readonly string[] = ["deleted", "recurring"];

/**
 * The unique keys made of data instead of the id (ADR-0009). Two devices without connection
 * can create two rows with the same key and different ids: one entry of the same habit and day
 * on each, for instance.
 */
const NATURAL_KEYS: Record<SyncTable, readonly string[]> = {
  habits: [],
  habit_versions: ["habit_id", "effective_from"],
  entries: ["habit_id", "date"],
  reminders: ["habit_id", "time"],
  weekly_goals: [],
  weekly_goal_versions: ["weekly_goal_id", "effective_from"],
  weekly_goal_entries: ["weekly_goal_id", "week"],
  long_term_goals: [],
  long_term_goal_entries: ["long_term_goal_id"],
};

/** The columns of `table` that travel to and from the cloud. */
export function syncedColumns(table: SyncTable): readonly string[] {
  return COLUMNS[table];
}

function toCloud(column: string, value: SqlValue): CloudValue {
  return BOOLEAN_COLUMNS.includes(column) ? value === 1 : value;
}

/** The value of `column` in `row`, as the device stores it. */
function localValue(row: CloudRow, column: string): SqlValue {
  const value = row[column];
  if (value === undefined) {
    throw new Error(`The row ${row.id} has no column ${column}.`);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * The rows of `table` with changes to upload, deleted or live as `deleted` says, in order of id,
 * starting after `afterId`, at most `limit`. They are asked for apart because the deleted ones
 * have to reach the account first (see `synchronize`).
 */
export async function pendingRows(
  db: Database,
  table: SyncTable,
  deleted: boolean,
  afterId: string,
  limit: number,
): Promise<CloudRow[]> {
  const columns = COLUMNS[table];
  const rows = await db.all<Record<string, SqlValue>>(
    `SELECT ${columns.join(", ")}
       FROM ${table}
      WHERE pending_sync = 1 AND deleted = ? AND id > ?
      ORDER BY id
      LIMIT ?`,
    [deleted ? 1 : 0, afterId, limit],
  );
  return rows.map(
    (row) =>
      Object.fromEntries(
        columns.map((column) => [column, toCloud(column, row[column])]),
      ) as CloudRow,
  );
}

/**
 * Records that `row`, as it was read, has reached the account at `updatedAt`. If the row has
 * changed in the meantime, it stays pending: the new change has not been uploaded yet.
 */
export async function markUploaded(
  db: Database,
  table: SyncTable,
  row: CloudRow,
  updatedAt: string,
): Promise<void> {
  const columns = COLUMNS[table].filter((column) => column !== "id");
  await db.run(
    `UPDATE ${table}
        SET updated_at = ?,
            pending_sync = CASE
              WHEN ${columns.map((column) => `${column} IS ?`).join(" AND ")} THEN 0
              ELSE pending_sync
            END
      WHERE id = ?`,
    [updatedAt, ...columns.map((column) => localValue(row, column)), row.id],
  );
}

/**
 * Applies the rows downloaded from the account. A row with changes still to upload keeps them:
 * they are more recent, and they reach the account right after (ADR-0018). Applying a row
 * that is already on the device changes nothing, so a page can be applied again.
 * Returns how many rows changed on the device.
 */
export async function applyPulledRows(
  db: Database,
  table: SyncTable,
  rows: readonly PulledRow[],
): Promise<number> {
  let changed = 0;
  for (const row of rows) {
    changed += await adoptCloudId(db, table, row);
    changed += await upsertPulledRow(db, table, row);
  }
  return changed;
}

/**
 * When a row of the account has the same natural key as a row of the device that has not been
 * uploaded yet, they are the same thing created twice. The row of the device takes the id of
 * the one of the account and keeps its values, which are more recent: the upload then updates
 * the row of the account instead of clashing with it.
 */
async function adoptCloudId(
  db: Database,
  table: SyncTable,
  row: PulledRow,
): Promise<number> {
  const keys = NATURAL_KEYS[table];
  if (keys.length === 0 || localValue(row, "deleted") === 1) return 0;
  const { changes } = await db.run(
    `UPDATE ${table}
        SET id = ?
      WHERE ${keys.map((key) => `${key} = ?`).join(" AND ")}
        AND deleted = 0
        AND pending_sync = 1
        AND id <> ?
        AND NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
    [row.id, ...keys.map((key) => localValue(row, key)), row.id, row.id],
  );
  return changes;
}

async function upsertPulledRow(
  db: Database,
  table: SyncTable,
  row: PulledRow,
): Promise<number> {
  const columns = COLUMNS[table];
  const updated = [
    ...columns.filter((column) => column !== "id"),
    "updated_at",
  ];
  const { changes } = await db.run(
    `INSERT INTO ${table} (${columns.join(", ")}, updated_at, pending_sync)
     VALUES (${columns.map(() => "?").join(", ")}, ?, 0)
     ON CONFLICT (id) DO UPDATE SET
       ${updated.map((column) => `${column} = excluded.${column}`).join(", ")}
     WHERE ${table}.pending_sync = 0
       AND (${updated
         .map((column) => `${table}.${column} IS NOT excluded.${column}`)
         .join(" OR ")})`,
    [...columns.map((column) => localValue(row, column)), row.updated_at],
  );
  return changes;
}

/** How far the download of `table` has gone, or null if it has never downloaded anything. */
export async function readCursor(
  db: Database,
  table: SyncTable,
): Promise<Cursor | null> {
  const row = await db.first<{ updated_at: string; id: string }>(
    "SELECT updated_at, id FROM sync_cursors WHERE table_name = ?",
    [table],
  );
  return row === null ? null : { updatedAt: row.updated_at, id: row.id };
}

export async function saveCursor(
  db: Database,
  table: SyncTable,
  cursor: Cursor,
): Promise<void> {
  await db.run(
    `INSERT INTO sync_cursors (table_name, updated_at, id) VALUES (?, ?, ?)
     ON CONFLICT (table_name) DO UPDATE SET
       updated_at = excluded.updated_at,
       id = excluded.id`,
    [table, cursor.updatedAt, cursor.id],
  );
}

/** The account the data on the device belong to, or null if they have never synchronized. */
export async function readSyncAccount(db: Database): Promise<string | null> {
  const row = await db.first<{ user_id: string }>(
    "SELECT user_id FROM sync_account",
  );
  return row?.user_id ?? null;
}

/**
 * Makes the data on the device belong to `userId` before synchronizing:
 * - Data that never synchronized become part of the account (RF-38).
 * - Data of another account are removed first: they are not mixed with this one. It happens if
 *   a session ended without signing out (RF-03), and another account then signed in.
 * Returns whether data were removed.
 */
export async function adoptSyncAccount(
  db: Database,
  userId: string,
): Promise<boolean> {
  const current = await readSyncAccount(db);
  if (current === userId) return false;
  const removed = current !== null;
  if (removed) await deleteAccountData(db);
  await db.run("INSERT INTO sync_account (id, user_id) VALUES (1, ?)", [
    userId,
  ]);
  return removed;
}
