// The Notifier interface on expo-notifications, and the permission to send reminders
// (RF-35, RF-36).

import * as Notifications from "expo-notifications";
import { IosAuthorizationStatus } from "expo-notifications";

import { parseLocalDate } from "@/domain/dates";
import { parseLocalTime } from "@/domain/times";

import { instantOf } from "./planner";
import type {
  Notifier,
  PlannedNotification,
  ReminderResponse,
  ScheduledNotification,
} from "./notifier";

// iOS gives back a date trigger as a time interval, so the minute it was scheduled for and
// the signature travel in the data.
interface ReminderData {
  readonly habitId: string;
  readonly date: string;
  readonly time: string;
  readonly signature: string;
}

function textIn(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

function signatureIn(data: Record<string, unknown> | undefined): string | null {
  return textIn(data, "signature");
}

/** The reminder that was answered, or null if the response is about something else. */
export function reminderResponseOf(
  response: Notifications.NotificationResponse,
): ReminderResponse | null {
  const { identifier, content } = response.notification.request;
  const habitId = textIn(content.data, "habitId");
  const date = parseLocalDate(textIn(content.data, "date") ?? "");
  const time = parseLocalTime(textIn(content.data, "time") ?? "");
  if (habitId === null || date === null || time === null) return null;

  const notification: PlannedNotification = {
    id: identifier,
    at: { date, time },
    title: content.title ?? "",
    body: content.body,
    habitId,
    category: content.categoryIdentifier ?? "",
  };
  const buttonId =
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ? null
      : response.actionIdentifier;
  return { buttonId, notification };
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
    const data: ReminderData = {
      habitId: notification.habitId,
      date: notification.at.date,
      time: notification.at.time,
      signature,
    };
    await Notifications.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body ?? undefined,
        sound: "default",
        categoryIdentifier: notification.category,
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

  async setCategory({ id, buttons }) {
    await Notifications.setNotificationCategoryAsync(
      id,
      buttons.map((button) => ({
        identifier: button.id,
        buttonTitle: button.title,
        // The button acts in the background, without opening the app (RF-25).
        options: { opensAppToForeground: false },
      })),
    );
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
