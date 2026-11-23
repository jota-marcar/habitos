// A Database for the tests, on the SQLite built into Node: real SQL, in memory and with no
// native module. It is only imported from test files.

import { DatabaseSync } from "node:sqlite";

import type { Database, SqlValue } from "../database";
import { serializedDatabase } from "../serialized-database";

export interface TestDatabase extends Database {
  close(): void;
}

/** Opens an empty in-memory database, with foreign keys enforced like on the device. */
export function openTestDatabase(): TestDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const all = <Row>(sql: string, params: readonly SqlValue[] = []) =>
    db.prepare(sql).all(...params) as Row[];

  // The same queue as on the device: a transaction that used the outer database by mistake
  // would never end here either, so its test fails instead of hiding it.
  const serialized = serializedDatabase({
    async execute(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      const { changes } = db.prepare(sql).run(...params);
      return { changes: Number(changes) };
    },
    async all<Row>(sql: string, params?: readonly SqlValue[]) {
      return all<Row>(sql, params);
    },
    async first<Row>(sql: string, params?: readonly SqlValue[]) {
      return all<Row>(sql, params)[0] ?? null;
    },
    async transaction(task) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  });

  return {
    ...serialized,
    close() {
      db.close();
    },
  };
}
