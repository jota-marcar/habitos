// The minimal database the data layer needs (ADR-0009).
// Repositories and migrations only use this interface, so the same SQL runs on the device
// (expo-sqlite) and in the tests (the SQLite built into Node).

export type SqlValue = string | number | null;

/** What a statement that returns no rows did. */
export interface RunResult {
  /** How many rows it inserted, updated or deleted. */
  readonly changes: number;
}

export interface Database {
  /** Runs one or more statements without parameters. For schema changes. */
  execute(sql: string): Promise<void>;

  /** Runs one statement that returns no rows. */
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;

  /** Returns every row of a query. */
  all<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;

  /** Returns the first row of a query, or null if there is none. */
  first<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row | null>;

  /**
   * Runs `task` in a transaction: all of its changes are kept, or none if it throws. Nothing
   * else runs meanwhile, so everything in `task` has to go through `tx`: an operation on the
   * outer database would wait for the transaction to end, and it never would.
   */
  transaction(task: (tx: Database) => Promise<void>): Promise<void>;
}
