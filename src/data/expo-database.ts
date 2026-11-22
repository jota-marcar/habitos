// The Database of the device, on expo-sqlite (ADR-0009, ADR-0010).
// A thin adapter with no logic of its own: the repositories only see the Database interface.

import type { SQLiteDatabase } from "expo-sqlite";

import type { Database, SqlValue } from "./database";
import { migrate } from "./migrations";
import { serializedDatabase } from "./serialized-database";

/** The part of expo-sqlite's database that the adapter uses. */
export type ExpoSQLiteDatabase = Pick<
  SQLiteDatabase,
  | "execAsync"
  | "runAsync"
  | "getAllAsync"
  | "getFirstAsync"
  | "withTransactionAsync"
>;

export function fromExpoSQLite(db: ExpoSQLiteDatabase): Database {
  // expo-sqlite takes mutable arrays.
  const params = (values: readonly SqlValue[] = []) => [...values];

  return serializedDatabase({
    async execute(sql) {
      await db.execAsync(sql);
    },
    async run(sql, values) {
      const { changes } = await db.runAsync(sql, params(values));
      return { changes };
    },
    all(sql, values) {
      return db.getAllAsync(sql, params(values));
    },
    first(sql, values) {
      return db.getFirstAsync(sql, params(values));
    },
    // Not the exclusive transaction: that one opens a new connection, which would not enforce
    // the foreign keys turned on in this one. `serializedDatabase` isolates this one instead.
    transaction(task) {
      return db.withTransactionAsync(task);
    },
  });
}

/**
 * Prepares a newly opened database: enforces the foreign keys, makes commits cheap with the
 * write-ahead log and brings the schema up to date.
 */
export async function prepareDatabase(db: Database): Promise<void> {
  await db.execute("PRAGMA foreign_keys = ON");
  await enableWriteAheadLog(db);
  await migrate(db);
}

// Only a matter of speed: the database works the same without it, so a failure here must not
// keep the app from opening. It stays on in the file, and needs no migration.
async function enableWriteAheadLog(db: Database): Promise<void> {
  try {
    await db.execute("PRAGMA journal_mode = WAL");
  } catch (error) {
    console.warn("The write-ahead log could not be enabled.", error);
  }
}
