// Keeps the data of the device and of the account in step while the app runs (ADR-0018). It
// synchronizes on opening the app or signing in and every time the app comes back, and after a
// synchronization that changed something, it refreshes the reminders (ADR-0005).

import { useEffect } from "react";
import { AppState } from "react-native";

import { refreshReminders } from "@/notifications/reminders";
import { onSyncedChanges, syncNow } from "@/sync/app-sync";

import { useDatabase } from "./database";
import { useSession } from "./session";

export function SyncKeeper() {
  const db = useDatabase();
  const userId = useSession()?.user.id;

  // The day on screen follows by itself (use-day).
  useEffect(() => onSyncedChanges(() => void refreshReminders(db)), [db]);

  useEffect(() => {
    if (userId === undefined) return;
    void syncNow(db);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow(db);
    });
    return () => subscription.remove();
  }, [db, userId]);

  return null;
}
