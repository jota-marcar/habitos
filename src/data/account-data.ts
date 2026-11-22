// The data of the account as a whole, for signing out (RF-03): whether something would be lost,
// and removing everything so that another account can sign in on the same phone.

import type { Database } from "./database";

/**
 * Every table with data of the account, children before their parents so that the foreign
 * keys allow deleting them in this order. A new table of the account must be added here: a
 * test checks that signing out leaves no row in any table.
 */
const ACCOUNT_TABLES = [
  "entries",
  "reminders",
  "habit_versions",
  "habits",
  "weekly_goal_entries",
  "weekly_goal_versions",
  "weekly_goals",
] as const;

/**
 * Whether some change has not reached the account yet. A row created and deleted before
 * being uploaded does not count: the account never had it, so nothing is lost.
 */
export async function hasPendingChanges(db: Database): Promise<boolean> {
  for (const table of ACCOUNT_TABLES) {
    const row = await db.first<{ found: number }>(
      `SELECT 1 AS found
         FROM ${table}
        WHERE pending_sync = 1
          AND NOT (deleted = 1 AND updated_at IS NULL)
        LIMIT 1`,
    );
    if (row !== null) return true;
  }
  return false;
}

/**
 * The state of the synchronization (ADR-0018). It goes with the data: the next account starts
 * from the beginning, and its data are not taken for those of the previous one.
 */
const SYNC_STATE_TABLES = ["sync_cursors", "sync_account"] as const;

/** Removes every row of the account from the device. The account keeps them in the cloud. */
export async function deleteAccountData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of [...ACCOUNT_TABLES, ...SYNC_STATE_TABLES]) {
      await tx.run(`DELETE FROM ${table}`);
    }
  });
}
