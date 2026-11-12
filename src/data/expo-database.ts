// The Database of the device, on expo-sqlite (ADR-0009, ADR-0010).
// A thin adapter with no logic of its own: the repositories only see the Database interface.

import type { SQLiteDatabase } from "expo-sqlite";

import type { Database, SqlValue } from "./database";
import { migrate } from "./migrations";

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

  return {
    async execute(sql) {
      await db.execAsync(sql);
    },
    async run(sql, values) {
      await db.runAsync(sql, params(values));
    },
    all(sql, values) {
      return db.getAllAsync(sql, params(values));
    },
    first(sql, values) {
      return db.getFirstAsync(sql, params(values));
    },
    // Not the exclusive transaction: that one opens a new connection, which would not enforce
    // the foreign keys turned on in this one.
    transaction(task) {
      return db.withTransactionAsync(task);
    },
  };
}

/** Prepares a newly opened database: enforces the foreign keys and brings the schema up to date. */
export async function prepareDatabase(db: Database): Promise<void> {
  await db.execute("PRAGMA foreign_keys = ON");
  await migrate(db);
}
