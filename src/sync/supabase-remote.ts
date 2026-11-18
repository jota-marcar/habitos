// The account in Supabase, for the synchronization (ADR-0003, ADR-0016, ADR-0018). A thin
// adapter over PostgREST, with no logic of its own. It is tested against a real Supabase in
// the CI (supabase/tests/sync.test.ts), not with npm test.
// Row Level Security only lets the session see and change its own rows, and the server fills
// in their user and their updated_at.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncedColumns,
  type CloudRow,
  type Cursor,
  type PulledRow,
  type SyncTable,
} from "@/data/sync-repository";

import type { Remote, UploadedRow } from "./remote";

/** An error of PostgREST, with the code of Postgres (23505 for a duplicate key). */
export class RemoteError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function failure(error: { message: string; code: string }): RemoteError {
  return new RemoteError(error.message, error.code);
}

/**
 * The filter of the rows after `cursor`, in order of (updated_at, id). The time goes in
 * quotes: it has dots and colons, which PostgREST would otherwise read as part of the filter.
 */
function afterCursor(cursor: Cursor): string {
  const at = `"${cursor.updatedAt}"`;
  return `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${cursor.id})`;
}

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async pull(
      table: SyncTable,
      after: Cursor | null,
      limit: number,
    ): Promise<PulledRow[]> {
      let query = client
        .from(table)
        .select([...syncedColumns(table), "updated_at"].join(","))
        .order("updated_at")
        .order("id")
        .limit(limit);
      if (after !== null) query = query.or(afterCursor(after));
      const { data, error } = await query;
      if (error !== null) throw failure(error);
      return data as unknown as PulledRow[];
    },

    async push(
      table: SyncTable,
      rows: readonly CloudRow[],
    ): Promise<UploadedRow[]> {
      const { data, error } = await client
        .from(table)
        .upsert([...rows], { onConflict: "id" })
        .select("id,updated_at");
      if (error !== null) throw failure(error);
      return data as UploadedRow[];
    },
  };
}
