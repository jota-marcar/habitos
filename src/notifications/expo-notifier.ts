// The Notifier interface on expo-notifications, and the permission to send reminders
// (RF-35, RF-36).

import * as Notifications from "expo-notifications";
import { IosAuthorizationStatus } from "expo-notifications";

import { instantOf } from "./planner";
import type { Notifier, ScheduledNotification } from "./notifier";

// iOS gives back a date trigger as a time interval, so the signature travels in the data.
interface ReminderData {
  readonly habitId: string;
  readonly signature: string;
}

function signatureIn(data: Record<string, unknown> | undefined): string | null {
  const signature = data?.signature;
  return typeof signature === "string" ? signature : null;
}

export const expoNotifier: Notifier = {
  async scheduled(): Promise<ScheduledNotification[]> {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    return requests.map((request) => ({
      id: request.identifier,
      signature: signatureIn(request.content.data),
    }));
  },

  async schedule(notification, signature) {
    const data: ReminderData = { habitId: notification.habitId, signature };
    await Notifications.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body ?? undefined,
        sound: "default",
        data: { ...data },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: instantOf(notification.at),
      },
    });
  },

  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};

/** Reminders that arrive with the app open are shown too, like any other. */
export function showRemindersInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Whether reminders can be sent. If the user has not been asked yet, asks now: on opening the
 * app (RF-35) or, if that did not happen, when a habit with reminders is saved (RF-36). iOS
 * only asks once; after a denial, only the phone's settings can change it.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (allowed(current)) return true;
  if (!current.canAskAgain) return false;
  return allowed(await Notifications.requestPermissionsAsync());
}

function allowed(permission: Notifications.NotificationPermissionsStatus) {
  return (
    permission.granted ||
    permission.ios?.status === IosAuthorizationStatus.PROVISIONAL
  );
}
