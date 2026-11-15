// The entry point the interface uses to keep the reminders up to date (ADR-0005): after every
// change, on opening the app and on coming back to it.

import type { Database } from "@/data/database";
import { now } from "@/ui/clock";

import { expoNotifier } from "./expo-notifier";
import {
  localDateTimeOf,
  plannedNotifications,
  serialized,
  syncNotifications,
} from "./planner";

let database: Database | null = null;

const refresh = serialized(async () => {
  if (database === null) return;
  const planned = await plannedNotifications(database, localDateTimeOf(now()));
  await syncNotifications(expoNotifier, planned);
});

/**
 * Schedules the reminders that have to warn next and cancels those that no longer do.
 * It never fails: a reminder that could not be scheduled is retried on the next refresh.
 */
export async function refreshReminders(db: Database): Promise<void> {
  database = db;
  try {
    await refresh();
  } catch (error) {
    console.warn("The reminders could not be refreshed.", error);
  }
}
