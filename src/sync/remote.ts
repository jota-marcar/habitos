// The account in the cloud, as the synchronization sees it (ADR-0018). On the device it is
// Supabase (supabase-remote.ts); in the tests, a server in memory (testing/fake-remote.ts).

import type {
  CloudRow,
  Cursor,
  PulledRow,
  SyncTable,
} from "@/data/sync-repository";

/** A row the account has just received, with the time the server gave to the change. */
export interface UploadedRow {
  readonly id: string;
  readonly updated_at: string;
}

export interface Remote {
  /**
   * The rows of `table` changed after `after` (all of them if null), in order of
   * (updated_at, id), at most `limit`.
   */
  pull(
    table: SyncTable,
    after: Cursor | null,
    limit: number,
  ): Promise<PulledRow[]>;

  /** Creates or updates `rows` of `table`, all of them or none. */
  push(table: SyncTable, rows: readonly CloudRow[]): Promise<UploadedRow[]>;
}
