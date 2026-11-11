// Schema of the local database and its migrations (ADR-0004, ADR-0009).
// The database stores its schema version in `PRAGMA user_version`. A migration is never
// edited once it has been released: a change to the schema is a new migration at the end.

import type { Database } from "./database";

// Columns shared by every table, for the synchronization (ADR-0004):
// - updated_at: assigned by the server; null until the row has been uploaded.
// - deleted: logical deletion, to propagate it to the server.
// - pending_sync: local only; 1 while the row has changes that have not been uploaded.
const SYNC_COLUMNS = `
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  pending_sync INTEGER NOT NULL DEFAULT 1 CHECK (pending_sync IN (0, 1))
`;

// The unique indexes leave out deleted rows, so that what was deleted can be created again.
const INITIAL_SCHEMA = `
  CREATE TABLE habits (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('boolean', 'quantitative')),
    created_on TEXT NOT NULL,
    archived_on TEXT,
    ${SYNC_COLUMNS}
  ) STRICT;

  CREATE TABLE habit_versions (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    effective_from TEXT NOT NULL,
    scheduled_days INTEGER NOT NULL CHECK (scheduled_days BETWEEN 1 AND 127),
    target REAL,
    unit TEXT,
    increment REAL,
    ${SYNC_COLUMNS}
  ) STRICT;

  CREATE UNIQUE INDEX habit_versions_habit_effective_from
    ON habit_versions (habit_id, effective_from) WHERE deleted = 0;

  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    value REAL NOT NULL CHECK (value >= 0),
    ${SYNC_COLUMNS}
  ) STRICT;

  CREATE UNIQUE INDEX entries_habit_date
    ON entries (habit_id, date) WHERE deleted = 0;

  CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    ${SYNC_COLUMNS}
  ) STRICT;

  CREATE UNIQUE INDEX reminders_habit_time
    ON reminders (habit_id, time) WHERE deleted = 0;
`;

/** Every migration, in order. The version of the schema is the position, starting at 1. */
export const MIGRATIONS: readonly string[] = [INITIAL_SCHEMA];

/** The version of the schema of `db`: 0 for a new database. */
export async function schemaVersion(db: Database): Promise<number> {
  // This pragma always returns exactly one row.
  const [row] = await db.all<{ user_version: number }>("PRAGMA user_version");
  return row.user_version;
}

/**
 * Brings the schema of `db` up to date, applying the migrations it is missing. Each one runs
 * in its own transaction together with its version number, so a failed migration leaves the
 * database as it was before it.
 */
export async function migrate(
  db: Database,
  migrations: readonly string[] = MIGRATIONS,
): Promise<void> {
  const current = await schemaVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `The database has schema version ${current}, newer than this app (${migrations.length}).`,
    );
  }

  for (let version = current + 1; version <= migrations.length; version++) {
    await db.transaction(async () => {
      await db.execute(migrations[version - 1]);
      await db.execute(`PRAGMA user_version = ${version}`);
    });
  }
}
