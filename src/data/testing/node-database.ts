// A Database for the tests, on the SQLite built into Node: real SQL, in memory and with no
// native module. It is only imported from test files.

import { DatabaseSync } from "node:sqlite";

import type { Database, SqlValue } from "../database";

export interface TestDatabase extends Database {
  close(): void;
}

/** Opens an empty in-memory database, with foreign keys enforced like on the device. */
export function openTestDatabase(): TestDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const all = <Row>(sql: string, params: readonly SqlValue[] = []) =>
    db.prepare(sql).all(...params) as Row[];

  return {
    async execute(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
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
    close() {
      db.close();
    },
  };
}
