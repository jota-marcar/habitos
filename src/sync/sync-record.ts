// Remembers on the device how the synchronizations have gone, to show the state of the copy
// (RF-53). It is not data of the account, so it does not synchronize. It lives outside the
// database on purpose: it needs no migration. Nothing here ever fails: a state that cannot be
// saved is not worth breaking a synchronization that went well.

import Storage from "expo-sqlite/kv-store";

import type { SyncRecord } from "@/domain/sync-status";

const LAST_COPIED_KEY = "sync.lastCopiedAt";
const FAILING_SINCE_KEY = "sync.failingSince";

const NOTHING: SyncRecord = { lastCopiedAt: null, failingSince: null };

function instantIn(text: string | null): number | null {
  if (text === null) return null;
  const instant = Number(text);
  return Number.isFinite(instant) ? instant : null;
}

async function safely(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.warn("The state of the copy could not be saved.", error);
  }
}

export async function readSyncRecord(): Promise<SyncRecord> {
  try {
    const [lastCopiedAt, failingSince] = await Promise.all([
      Storage.getItem(LAST_COPIED_KEY),
      Storage.getItem(FAILING_SINCE_KEY),
    ]);
    return {
      lastCopiedAt: instantIn(lastCopiedAt),
      failingSince: instantIn(failingSince),
    };
  } catch (error) {
    console.warn("The state of the copy could not be read.", error);
    return NOTHING;
  }
}

export function recordSyncSuccess(now: number): Promise<void> {
  return safely(async () => {
    await Storage.setItem(LAST_COPIED_KEY, String(now));
    await Storage.removeItem(FAILING_SINCE_KEY);
  });
}

/** Keeps the moment of the first failure: what counts is how long it has been failing. */
export function recordSyncFailure(now: number): Promise<void> {
  return safely(async () => {
    if ((await Storage.getItem(FAILING_SINCE_KEY)) === null) {
      await Storage.setItem(FAILING_SINCE_KEY, String(now));
    }
  });
}

/** Forgets it all: the next account starts from the beginning. */
export function clearSyncRecord(): Promise<void> {
  return safely(async () => {
    await Storage.removeItem(LAST_COPIED_KEY);
    await Storage.removeItem(FAILING_SINCE_KEY);
  });
}
