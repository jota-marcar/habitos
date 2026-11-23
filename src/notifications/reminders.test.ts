import * as Notifications from "expo-notifications";

import { listEntries } from "@/data/entries-repository";
import { addHabit } from "@/data/habits-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate } from "@/domain/dates";
import { localTime } from "@/domain/times";
import { requestHorizon } from "@/shared/horizon-request";
import { syncNow } from "@/sync/app-sync";

import { onReminderRecorded } from "./actions";
import {
  markGestureLearned,
  readGestureHint,
  startGestureHint,
} from "./gesture-hint-store";
import { NO_GESTURE_HINT } from "./planner";
import { listenToReminders, refreshReminders } from "./reminders";
import type { fakeNotifier } from "./testing/fake-notifier";

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "tap",
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));
jest.mock("@/sync/app-sync", () => ({ syncNow: jest.fn() }));
// Thursday, 12 November 2026, at 10:00.
jest.mock("@/shared/clock", () => ({
  now: () => new Date(2026, 10, 12, 10, 0),
  newId: () => "new-id",
}));
jest.mock("@/shared/horizon-request", () => ({ requestHorizon: jest.fn() }));
jest.mock("./gesture-hint-store", () => ({
  readGestureHint: jest.fn(),
  startGestureHint: jest.fn(),
  markGestureLearned: jest.fn(),
}));
// The real parsing of the responses, on a notifier in memory.
jest.mock("./expo-notifier", () => {
  const fake = jest
    .requireActual<typeof import("./testing/fake-notifier")>(
      "./testing/fake-notifier",
    )
    .fakeNotifier();
  return {
    ...jest.requireActual("./expo-notifier"),
    expoNotifier: fake.notifier,
    fake,
  };
});

const { fake } = jest.requireMock<{ fake: ReturnType<typeof fakeNotifier> }>(
  "./expo-notifier",
);

const TODAY = localDate("2026-11-12");
const REMINDER_ID = `reminder.meditate@18:00.${TODAY}`;

let db: TestDatabase;
let warn: jest.SpyInstance;

function response(
  actionIdentifier: string,
  { identifier = REMINDER_ID, habitId = "meditate" as string | null } = {},
) {
  return {
    actionIdentifier,
    notification: {
      date: 1,
      request: {
        identifier,
        content: {
          title: "meditate",
          body: null,
          categoryIdentifier: "reminder_boolean",
          data: { habitId, date: TODAY, time: "18:00", signature: "s" },
        },
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

/** Starts listening and returns how to deliver a response to the listener. */
function listen(openDatabase: () => Promise<TestDatabase> = async () => db) {
  listenToReminders(openDatabase);
  const [[deliver]] = jest.mocked(
    Notifications.addNotificationResponseReceivedListener,
  ).mock.calls;
  return deliver;
}

// The listener does not return its promise: this lets everything it started finish.
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

const entriesToday = () => listEntries(db, TODAY, TODAY);

beforeEach(async () => {
  jest.clearAllMocks();
  fake.scheduled.clear();
  fake.notifications.clear();
  fake.log.length = 0;
  jest.mocked(readGestureHint).mockResolvedValue(NO_GESTURE_HINT);
  jest.mocked(Notifications.getLastNotificationResponse).mockReturnValue(null);
  jest.mocked(syncNow).mockResolvedValue();
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  db = await openMigratedDatabase();
  await addHabit(db, habit("meditate"), version("meditate"), [
    {
      id: "meditate@18:00",
      habitId: "meditate",
      time: localTime("18:00"),
    },
  ]);
});

afterEach(() => {
  warn.mockRestore();
  db.close();
});

describe("refreshReminders", () => {
  test("schedules the reminders of the database", async () => {
    await refreshReminders(db);

    expect([...fake.scheduled.keys()]).toContain(REMINDER_ID);
  });

  test("remembers the day the gesture hint starts (RF-25)", async () => {
    jest
      .mocked(readGestureHint)
      .mockResolvedValue({ startedOn: null, learned: false });

    await refreshReminders(db);

    expect(startGestureHint).toHaveBeenCalledWith(TODAY);
  });

  test("does not start again a gesture hint already started", async () => {
    jest
      .mocked(readGestureHint)
      .mockResolvedValue({ startedOn: TODAY, learned: false });

    await refreshReminders(db);

    expect(startGestureHint).not.toHaveBeenCalled();
  });

  test("never fails: the next refresh tries again", async () => {
    jest.mocked(readGestureHint).mockRejectedValue(new Error("broken"));

    await expect(refreshReminders(db)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      "The reminders could not be refreshed.",
      expect.any(Error),
    );
  });
});

describe("listenToReminders", () => {
  test("a button records the habit, syncs and warns the screens (RF-25)", async () => {
    const recorded = jest.fn();
    const stop = onReminderRecorded(recorded);
    const deliver = listen();

    deliver(response("done"));
    await settled();
    stop();

    expect(await entriesToday()).toEqual([
      expect.objectContaining({ habitId: "meditate", value: 1 }),
    ]);
    expect(markGestureLearned).toHaveBeenCalled();
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith(db);
    expect(requestHorizon).not.toHaveBeenCalled();
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });

  test("tapping a reminder opens its page and records nothing (RF-26)", async () => {
    const deliver = listen();

    deliver(response("tap"));
    await settled();

    expect(requestHorizon).toHaveBeenCalledWith("habits");
    expect(markGestureLearned).not.toHaveBeenCalled();
    expect(await entriesToday()).toEqual([]);
    expect(syncNow).not.toHaveBeenCalled();
  });

  test("tapping a digest only opens its page, without the database (RF-37)", async () => {
    const openDatabase = jest.fn(async () => db);
    const deliver = listen(openDatabase);

    deliver(
      response("tap", { identifier: "digest.2026-11-12.17:00", habitId: null }),
    );
    await settled();

    expect(requestHorizon).toHaveBeenCalledWith("habits");
    expect(openDatabase).not.toHaveBeenCalled();
  });

  test("a button of a habit that no longer applies does not sync", async () => {
    const deliver = listen();

    deliver(response("done", { habitId: "gone" }));
    await settled();

    expect(await entriesToday()).toEqual([]);
    expect(syncNow).not.toHaveBeenCalled();
  });

  test("the same response arriving twice is answered once", async () => {
    const deliver = listen();

    deliver(response("add"));
    deliver(response("add"));
    await settled();

    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(
      1,
    );
  });

  test("answers the response that started the app", async () => {
    jest
      .mocked(Notifications.getLastNotificationResponse)
      .mockReturnValue(response("done"));

    listen();
    await settled();

    expect(await entriesToday()).toHaveLength(1);
  });

  test("a response that fails only leaves a warning", async () => {
    const deliver = listen(() => Promise.reject(new Error("no database")));

    deliver(response("done"));
    await settled();

    expect(warn).toHaveBeenCalledWith(
      "A reminder could not be answered.",
      expect.any(Error),
    );
  });
});
