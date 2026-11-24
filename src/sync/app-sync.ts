// The synchronization of the app with the account of the session (ADR-0018). It runs on
// opening the app and coming back to it, a moment after each local change, from the task in
// the background, and again later if it fails. Without a session it does nothing.

import { reportError } from "@/shared/error-reporting";
import { supabase } from "@/shared/supabase";
import type { Database } from "@/data/database";

import { createSyncScheduler } from "./scheduler";
import { supabaseRemote } from "./supabase-remote";
import { recordSyncFailure, recordSyncSuccess } from "./sync-record";
import { synchronize } from "./synchronize";

let database: Database | null = null;
const changeListeners = new Set<() => void>();
const finishedListeners = new Set<() => void>();

const notifyFinished = () =>
  finishedListeners.forEach((listener) => listener());

const scheduler = createSyncScheduler(
  async () => {
    // Every request gives the database before asking for a run.
    const db = database as Database;
    // It renews the session first if it has expired.
    const { data, error } = await supabase().auth.getSession();
    if (error !== null) throw error;
    if (data.session === null) return;
    const { changed } = await synchronize(
      db,
      supabaseRemote(supabase()),
      data.session.user.id,
    );
    await recordSyncSuccess(Date.now());
    notifyFinished();
    if (changed) changeListeners.forEach((listener) => listener());
  },
  (error) => {
    console.warn("The data could not be synchronized.", error);
    reportError(error, "sync");
    void recordSyncFailure(Date.now()).then(notifyFinished);
  },
);

/**
 * Synchronizes as soon as possible. The promise ends with the synchronization, and never
 * fails: a failed one is retried later.
 */
export function syncNow(db: Database): Promise<void> {
  database = db;
  return scheduler.request();
}

/** Synchronizes in a moment: for a local change, which may come with others. */
export function syncSoon(db: Database): void {
  database = db;
  scheduler.requestSoon();
}

/**
 * Stops synchronizing, waiting for a synchronization in progress, until `resumeSync`. Signing
 * out needs it: a download that ended after removing the data would bring them back.
 */
export function suspendSync(): Promise<void> {
  return scheduler.suspend();
}

export function resumeSync(): void {
  scheduler.resume();
}

/**
 * Calls `listener` whenever a synchronization changes the data on the device: the screens and
 * the reminders have to follow. Returns how to stop.
 */
export function onSyncedChanges(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * Calls `listener` whenever a synchronization ends, well or not: the state of the copy has to
 * follow (RF-53). Returns how to stop.
 */
export function onSyncFinished(listener: () => void): () => void {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}
