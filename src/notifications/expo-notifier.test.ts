import * as Notifications from "expo-notifications";
import type { NotificationResponse } from "expo-notifications";

import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";

import {
  ensureNotificationPermission,
  expoNotifier,
  reminderResponseOf,
  removeAllNotifications,
  showRemindersInForeground,
  tappedHorizon,
} from "./expo-notifier";
import type { PlannedNotification } from "./notifier";
import { instantOf } from "./planner";

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "tap",
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

function response(identifier: string, actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: { request: { identifier } },
  } as unknown as NotificationResponse;
}

function responseWith(
  actionIdentifier: string,
  content: Record<string, unknown>,
) {
  return {
    actionIdentifier,
    notification: { request: { identifier: "reminder.r1", content } },
  } as unknown as NotificationResponse;
}

const DATA = { habitId: "h1", date: "2026-11-12", time: "18:00" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tappedHorizon", () => {
  test("tapping a progress digest opens the weekly page (RF-49)", () => {
    expect(tappedHorizon(response("progress.2026-11-12.20:00", "tap"))).toBe(
      "weekly",
    );
  });

  test("tapping a reminder or a pending digest opens the habits (RF-26, RF-37)", () => {
    expect(tappedHorizon(response("reminder.r1.2026-11-12", "tap"))).toBe(
      "habits",
    );
    expect(tappedHorizon(response("digest.2026-11-12.17:00", "tap"))).toBe(
      "habits",
    );
  });

  test("a button acts without moving the screen (RF-25)", () => {
    expect(
      tappedHorizon(response("reminder.r1.2026-11-12", "done")),
    ).toBeNull();
  });
});

describe("reminderResponseOf", () => {
  test("rebuilds the reminder and its button from the notification", () => {
    const answer = reminderResponseOf(
      responseWith("done", {
        title: "Leer",
        body: "Llevas 1 de 2",
        categoryIdentifier: "reminder_boolean",
        data: DATA,
      }),
    );

    expect(answer).toEqual({
      buttonId: "done",
      notification: {
        id: "reminder.r1",
        at: { date: localDate("2026-11-12"), time: localTime("18:00") },
        title: "Leer",
        body: "Llevas 1 de 2",
        habitId: "h1",
        category: "reminder_boolean",
      },
    });
  });

  test("tapping the reminder itself has no button (RF-26)", () => {
    const answer = reminderResponseOf(
      responseWith("tap", { title: null, body: null, data: DATA }),
    );

    expect(answer?.buttonId).toBeNull();
    expect(answer?.notification.title).toBe("");
    expect(answer?.notification.category).toBeNull();
  });

  test.each([
    ["has no data", undefined],
    ["has no habit, like a digest", { ...DATA, habitId: null }],
    ["has no date", { habitId: "h1", time: "18:00" }],
    ["has no time", { habitId: "h1", date: "2026-11-12" }],
    ["has a date that is not one", { ...DATA, date: "yesterday" }],
    ["has a time that is not one", { ...DATA, time: "late" }],
  ])("a notification that %s is not a reminder", (_name, data) => {
    expect(
      reminderResponseOf(responseWith("tap", { title: "x", data })),
    ).toBeNull();
  });
});

describe("expoNotifier", () => {
  const notification: PlannedNotification = {
    id: "reminder.r1",
    at: { date: localDate("2026-11-12"), time: localTime("18:00") },
    title: "Leer",
    body: null,
    habitId: "h1",
    category: null,
  };

  test("lists what is scheduled, with its signature", async () => {
    jest
      .mocked(Notifications.getAllScheduledNotificationsAsync)
      .mockResolvedValue([
        { identifier: "a", content: { data: { signature: "s" } } },
        { identifier: "b", content: { data: {} } },
      ] as never);

    expect(await expoNotifier.scheduled()).toEqual([
      { id: "a", signature: "s" },
      { id: "b", signature: null },
    ]);
  });

  test("schedules at the local minute and keeps it in the data", async () => {
    await expoNotifier.schedule(notification, "signature");

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "reminder.r1",
      content: {
        title: "Leer",
        body: undefined,
        sound: "default",
        categoryIdentifier: undefined,
        data: {
          habitId: "h1",
          date: "2026-11-12",
          time: "18:00",
          signature: "signature",
        },
      },
      trigger: { type: "date", date: instantOf(notification.at) },
    });
  });

  test("passes on the body and the category when there are", async () => {
    await expoNotifier.schedule(
      { ...notification, body: "Llevas 1", category: "reminder_boolean" },
      "signature",
    );

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: "Llevas 1",
          categoryIdentifier: "reminder_boolean",
        }),
      }),
    );
  });

  test("cancels by identifier", async () => {
    await expoNotifier.cancel("reminder.r1");

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "reminder.r1",
    );
  });

  test("the buttons act without opening the app (RF-25)", async () => {
    await expoNotifier.setCategory({
      id: "reminder_boolean",
      buttons: [{ id: "done", title: "Hecho" }],
    });

    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      "reminder_boolean",
      [
        {
          identifier: "done",
          buttonTitle: "Hecho",
          options: { opensAppToForeground: false },
        },
      ],
    );
  });
});

test("signing out removes the scheduled notifications and those shown (RF-03)", async () => {
  await removeAllNotifications();

  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
});

test("reminders that arrive with the app open are shown", async () => {
  showRemindersInForeground();

  const [[handler]] = jest.mocked(Notifications.setNotificationHandler).mock
    .calls;
  expect(await handler?.handleNotification({} as never)).toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
});

describe("ensureNotificationPermission", () => {
  const permission = (values: Record<string, unknown>) => values as never;

  test("already granted, it does not ask", async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission({ granted: true }));

    expect(await ensureNotificationPermission()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("provisional counts as allowed", async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission({ granted: false, ios: { status: 3 } }));

    expect(await ensureNotificationPermission()).toBe(true);
  });

  test("after a denial, iOS does not ask again (RF-36)", async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission({ granted: false, canAskAgain: false }));

    expect(await ensureNotificationPermission()).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test.each([
    [true, { granted: true }],
    [false, { granted: false, ios: { status: 1 } }],
  ])("asks if it can, and answers %s", async (expected, answer) => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission({ granted: false, canAskAgain: true }));
    jest
      .mocked(Notifications.requestPermissionsAsync)
      .mockResolvedValue(permission(answer));

    expect(await ensureNotificationPermission()).toBe(expected);
  });
});
