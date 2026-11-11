// The minimal database the data layer needs (ADR-0009).
// Repositories and migrations only use this interface, so the same SQL runs on the device
// (expo-sqlite) and in the tests (the SQLite built into Node).

export type SqlValue = string | number | null;

export interface Database {
  /** Runs one or more statements without parameters. For schema changes. */
  execute(sql: string): Promise<void>;

  /** Runs one statement that returns no rows. */
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;

  /** Returns every row of a query. */
  all<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;

  /** Returns the first row of a query, or null if there is none. */
  first<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row | null>;

  /** Runs `task` in a transaction: all of its changes are kept, or none if it throws. */
  transaction(task: () => Promise<void>): Promise<void>;
}
