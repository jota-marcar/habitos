// The state of the copy in the account (RF-53): whether what is on the device has reached it,
// so that a synchronization failing for days does not go unnoticed.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** After how many days of failing with changes to copy the main screen says so (RF-53). */
export const STUCK_AFTER_DAYS = 3;

/** What the device remembers about its synchronizations, as instants in milliseconds. */
export interface SyncRecord {
  /** The last synchronization that ended well, or null if none has. */
  readonly lastCopiedAt: number | null;
  /** When it started failing, or null if the last one ended well. */
  readonly failingSince: number | null;
}

export type SyncStatus =
  /** Nothing has been copied yet, and nothing is waiting to be. */
  | { readonly kind: "none" }
  | { readonly kind: "copied"; readonly at: number }
  /** There are changes to copy, as there are for a moment after any change. */
  | { readonly kind: "pending" }
  /** There are changes that have been failing to reach the account for days. */
  | { readonly kind: "stuck"; readonly days: number };

export function syncStatusOf(
  { lastCopiedAt, failingSince }: SyncRecord,
  hasPendingChanges: boolean,
  now: number,
): SyncStatus {
  if (hasPendingChanges) {
    const days =
      failingSince === null ? 0 : Math.floor((now - failingSince) / MS_PER_DAY);
    return days >= STUCK_AFTER_DAYS
      ? { kind: "stuck", days }
      : { kind: "pending" };
  }
  return lastCopiedAt === null
    ? { kind: "none" }
    : { kind: "copied", at: lastCopiedAt };
}
