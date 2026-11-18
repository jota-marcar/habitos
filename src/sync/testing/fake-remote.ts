// An account in memory for the tests of the synchronization. It behaves like the Supabase
// schema where the synchronization depends on it (supabase/migrations):
// - The server assigns updated_at, and every row of one upload shares it, like the rows of
//   one transaction (ADR-0016).
// - An upload is all or nothing.
// - The children need their habit, and the natural keys are unique among live rows.

import type {
  CloudRow,
  Cursor,
  PulledRow,
  SyncTable,
} from "@/data/sync-repository";

import type { Remote, UploadedRow } from "../remote";

const NATURAL_KEYS: Record<SyncTable, readonly string[]> = {
  habits: [],
  habit_versions: ["habit_id", "effective_from"],
  entries: ["habit_id", "date"],
  reminders: ["habit_id", "time"],
};

/** The error of Postgres for a unique key that already exists. */
export class UniqueViolation extends Error {
  readonly code = "23505";
}

function isAfter(row: PulledRow, cursor: Cursor | null): boolean {
  if (cursor === null) return true;
  return (
    row.updated_at > cursor.updatedAt ||
    (row.updated_at === cursor.updatedAt && row.id > cursor.id)
  );
}

function byCursor(a: PulledRow, b: PulledRow): number {
  if (a.updated_at !== b.updated_at)
    return a.updated_at < b.updated_at ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

export class FakeRemote implements Remote {
  private clock = 0;

  readonly rows: Record<SyncTable, Map<string, PulledRow>> = {
    habits: new Map(),
    habit_versions: new Map(),
    entries: new Map(),
    reminders: new Map(),
  };

  /** Runs before answering each pull: what other devices do meanwhile. */
  beforePull: (table: SyncTable) => Promise<void> = async () => {};

  /** Runs before answering each push. */
  beforePush: (table: SyncTable) => Promise<void> = async () => {};

  async pull(
    table: SyncTable,
    after: Cursor | null,
    limit: number,
  ): Promise<PulledRow[]> {
    await this.beforePull(table);
    return [...this.rows[table].values()]
      .filter((row) => isAfter(row, after))
      .sort(byCursor)
      .slice(0, limit);
  }

  async push(
    table: SyncTable,
    rows: readonly CloudRow[],
  ): Promise<UploadedRow[]> {
    await this.beforePush(table);
    this.clock += 1;
    const updatedAt = `2026-11-18T10:00:00.${String(this.clock).padStart(6, "0")}+00:00`;

    const next = new Map(this.rows[table]);
    for (const row of rows) {
      next.set(row.id, { ...row, updated_at: updatedAt });
    }
    this.check(table, next);
    this.rows[table] = next;
    return rows.map((row) => ({ id: row.id, updated_at: updatedAt }));
  }

  /** The values of one row of the account, without the time of the server. */
  row(table: SyncTable, id: string): CloudRow | undefined {
    const row = this.rows[table].get(id);
    if (row === undefined) return undefined;
    const { updated_at: _updatedAt, ...values } = row;
    return values as CloudRow;
  }

  private check(table: SyncTable, rows: Map<string, PulledRow>): void {
    const keys = NATURAL_KEYS[table];
    const seen = new Set<string>();
    for (const row of rows.values()) {
      if (table !== "habits" && !this.rows.habits.has(String(row.habit_id))) {
        throw new Error(`The habit of ${table} ${row.id} does not exist.`);
      }
      if (keys.length === 0 || row.deleted === true) continue;
      const key = keys.map((column) => String(row[column])).join("|");
      if (seen.has(key)) {
        throw new UniqueViolation(`Duplicate key ${key} in ${table}.`);
      }
      seen.add(key);
    }
  }
}
