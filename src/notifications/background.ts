// Refreshes the reminders from time to time with the app closed, so that the window does not
// run out if the app is not opened for days (ADR-0005). It synchronizes first (ADR-0018).
// iOS decides when the task runs, if at all: it is a help, not a guarantee.

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import type { Database } from "@/data/database";
import { syncNow } from "@/sync/app-sync";

import { refreshReminders } from "./reminders";

const REFRESH_TASK = "refresh-reminders";

// The least time between two runs that iOS is asked for. Refreshing is cheap, and a full
// window lasts days unless a habit has many reminders a day.
const MINIMUM_INTERVAL_MINUTES = 12 * 60;

/**
 * Defines the task and registers it with iOS. The definition has to happen as the app starts,
 * before anything else: iOS may start the app in the background only to run it.
 */
export function refreshRemindersInBackground(
  openDatabase: () => Promise<Database>,
): void {
  TaskManager.defineTask(REFRESH_TASK, async () => {
    try {
      const db = await openDatabase();
      // What changed on other devices first: a habit done there has no reminders left here.
      await syncNow(db);
      await refreshReminders(db);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  const register = async () => {
    if (await TaskManager.isTaskRegisteredAsync(REFRESH_TASK)) return;
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  };
  register().catch((error: unknown) =>
    console.warn("The background refresh could not be registered.", error),
  );
}
