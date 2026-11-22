// One synchronization between the device and the account (ADR-0004, ADR-0016, ADR-0018).
//
// 1. The data on the device are made to belong to the account of the session (RF-38).
// 2. Pull: each table, parents first, downloads what changed in the account since its cursor.
//    Rows with local changes still to upload keep them.
// 3. Push: each table, parents first, uploads the rows with local changes.
//
// The pull goes first so that a row created on two devices with the same natural key (one
// entry of the same habit and day) is joined on the device before uploading it, instead of
// clashing in the account. Each page is written in one short transaction, never held across a
// request: every step can be repeated without harm, and a synchronization that fails half way
// is completed by the next one.

import type { Database } from "@/data/database";
import {
  SYNC_TABLES,
  adoptSyncAccount,
  applyPulledRows,
  markUploaded,
  pendingRows,
  readCursor,
  saveCursor,
  type SyncTable,
} from "@/data/sync-repository";

import type { Remote } from "./remote";

/** How many rows are downloaded or uploaded at once. */
const PAGE_SIZE = 500;

export interface SyncResult {
  /** Whether the data on the device changed: the screens and the reminders have to follow. */
  readonly changed: boolean;
}

export async function synchronize(
  db: Database,
  remote: Remote,
  userId: string,
  pageSize = PAGE_SIZE,
): Promise<SyncResult> {
  let changed = await adoptSyncAccount(db, userId);
  for (const table of SYNC_TABLES) {
    if (await pull(db, remote, table, pageSize)) changed = true;
  }
  for (const table of SYNC_TABLES) {
    await push(db, remote, table, pageSize);
  }
  return { changed };
}

/** Downloads the changes of `table`. Returns whether something changed on the device. */
async function pull(
  db: Database,
  remote: Remote,
  table: SyncTable,
  pageSize: number,
): Promise<boolean> {
  let changed = false;
  let cursor = await readCursor(db, table);
  for (;;) {
    const rows = await remote.pull(table, cursor, pageSize);
    if (rows.length === 0) return changed;
    const last = rows[rows.length - 1];
    const next = { updatedAt: last.updated_at, id: last.id };
    let applied = 0;
    // The page and its cursor together: the cursor never gets ahead of what is on the device.
    await db.transaction(async (tx) => {
      applied = await applyPulledRows(tx, table, rows);
      await saveCursor(tx, table, next);
    });
    if (applied > 0) changed = true;
    cursor = next;
    if (rows.length < pageSize) return changed;
  }
}

/**
 * Uploads the local changes of `table`, the deleted rows first. The account checks its unique
 * keys row by row: a reminder removed and set again at the same time would clash with the old
 * one if it arrived before its deletion, and that upload would fail on every retry.
 */
async function push(
  db: Database,
  remote: Remote,
  table: SyncTable,
  pageSize: number,
): Promise<void> {
  await pushRows(db, remote, table, true, pageSize);
  await pushRows(db, remote, table, false, pageSize);
}

async function pushRows(
  db: Database,
  remote: Remote,
  table: SyncTable,
  deleted: boolean,
  pageSize: number,
): Promise<void> {
  let afterId = "";
  for (;;) {
    const rows = await pendingRows(db, table, deleted, afterId, pageSize);
    if (rows.length === 0) return;
    const uploaded = await remote.push(table, rows);
    const updatedAt = new Map(uploaded.map((row) => [row.id, row.updated_at]));
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const at = updatedAt.get(row.id);
        if (at !== undefined) await markUploaded(tx, table, row, at);
      }
    });
    afterId = rows[rows.length - 1].id;
    if (rows.length < pageSize) return;
  }
}
