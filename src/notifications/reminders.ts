// The entry point of the reminders on the device (ADR-0005): keeps them up to date after every
// change, on opening the app and on coming back to it, and answers their buttons (RF-25).

import * as Notifications from "expo-notifications";

import type { Database } from "@/data/database";
import { syncNow } from "@/sync/app-sync";
import { newId, now } from "@/shared/clock";
import { reportError } from "@/shared/error-reporting";
import { requestHorizon } from "@/shared/horizon-request";

import { answerReminder, notifyReminderRecorded } from "./actions";
import {
  expoNotifier,
  reminderResponseOf,
  tappedHorizon,
} from "./expo-notifier";
import {
  markGestureLearned,
  readGestureHint,
  startGestureHint,
} from "./gesture-hint-store";
import {
  localDateTimeOf,
  planReminders,
  serialized,
  syncNotifications,
} from "./planner";

// Set by `refreshReminders`, the only way to reach `refresh`.
let database!: Database;
// The categories registered since the app started: iOS keeps them, but they are registered
// again once per run in case they changed.
const knownCategories = new Map<string, string>();

const refresh = serialized(async () => {
  const gestureHint = await readGestureHint();
  const plan = await planReminders(
    database,
    localDateTimeOf(now()),
    gestureHint,
  );
  if (
    plan.gestureHintStartedOn !== null &&
    plan.gestureHintStartedOn !== gestureHint.startedOn
  ) {
    await startGestureHint(plan.gestureHintStartedOn);
  }
  await syncNotifications(expoNotifier, plan, knownCategories);
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
    reportError(error, "reminders");
  }
}

/**
 * Answers the buttons of the reminders. It has to start before anything else: iOS may start
 * the app in the background only to deliver one (RF-25).
 */
export function listenToReminders(openDatabase: () => Promise<Database>) {
  // The same response can arrive twice: through the listener and as the last response.
  const answered = new Set<string>();

  const answer = async (response: Notifications.NotificationResponse) => {
    const key = [
      response.notification.request.identifier,
      response.actionIdentifier,
      response.notification.date,
    ].join("|");
    if (answered.has(key)) return;
    answered.add(key);
    // Otherwise the next start of the app would answer it again.
    Notifications.clearLastNotificationResponse();

    const horizon = tappedHorizon(response);
    if (horizon !== null) requestHorizon(horizon);

    const reminder = reminderResponseOf(response);
    if (reminder === null) return;
    if (reminder.buttonId !== null) await markGestureLearned();
    const db = await openDatabase();
    const recorded = await answerReminder(
      db,
      expoNotifier,
      reminder,
      localDateTimeOf(now()),
      newId,
    );
    await refreshReminders(db);
    if (recorded) {
      notifyReminderRecorded();
      // At once: iOS may suspend the app soon after answering in the background.
      void syncNow(db);
    }
  };

  const safely = (response: Notifications.NotificationResponse) =>
    answer(response).catch((error: unknown) => {
      console.warn("A reminder could not be answered.", error);
      reportError(error, "reminders");
    });

  Notifications.addNotificationResponseReceivedListener(
    (response) => void safely(response),
  );
  const last = Notifications.getLastNotificationResponse();
  if (last !== null) void safely(last);
}
