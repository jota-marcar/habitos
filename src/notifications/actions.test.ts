import { listEntries, saveEntry } from "@/data/entries-repository";
import { addHabit, saveHabit } from "@/data/habits-repository";
import { listTasks, saveTask } from "@/data/tasks-repository";
import {
  habit,
  openMigratedDatabase,
  task,
  version,
} from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate } from "@/domain/dates";
import { localTime, type LocalDateTime } from "@/domain/times";

import {
  answerReminder,
  notifyReminderRecorded,
  onReminderRecorded,
} from "./actions";
import type { PlannedNotification, ReminderResponse } from "./notifier";
import { signatureOf } from "./planner";
import { fakeNotifier } from "./testing/fake-notifier";

let db: TestDatabase;

// Thursday, 12 November 2026, after the habits of the fixtures are created.
const TODAY = localDate("2026-11-12");
const NOW: LocalDateTime = { date: TODAY, time: localTime("21:05") };

function reminderOf(habitId: string, date = TODAY): PlannedNotification {
  return {
    id: `reminder.${habitId}@21:00.${date}`,
    at: { date, time: localTime("21:00") },
    title: habitId,
    body: null,
    habitId,
    category: "reminder_boolean",
  };
}

function press(
  buttonId: string | null,
  habitId: string,
  { now = NOW, date = TODAY } = {},
) {
  const { notifier, notifications } = fakeNotifier();
  const response: ReminderResponse = {
    buttonId,
    notification: reminderOf(habitId, date),
  };
  let ids = 0;
  const answered = answerReminder(
    db,
    notifier,
    response,
    now,
    () => `new-${++ids}`,
  );
  return { answered, notifications };
}

beforeEach(async () => {
  db = await openMigratedDatabase();
  await addHabit(db, habit("meditate"), version("meditate"));
  await addHabit(
    db,
    habit("water", { type: "quantitative" }),
    version("water", { target: 2, unit: "L", increment: 0.25 }),
  );
});

afterEach(() => {
  db.close();
});

const valueOf = async (habitId: string, date = TODAY) =>
  (await listEntries(db, date, date)).find((e) => e.habitId === habitId)?.value;

describe("the button of a task alert", () => {
  const dueTonight = { dueOn: TODAY, dueTime: localTime("23:00") };

  function pressOnTask(buttonId: string | null, taskId: string, now = NOW) {
    const { notifier } = fakeNotifier();
    return answerReminder(
      db,
      notifier,
      {
        buttonId,
        notification: {
          id: `task.${taskId}.1h`,
          at: { date: TODAY, time: localTime("22:00") },
          title: taskId,
          body: null,
          habitId: null,
          taskId,
          category: "task_boolean",
        },
      },
      now,
      () => "unused",
    );
  }

  test("marks a boolean task done today, and never unmarks it", async () => {
    await saveTask(db, task("pay", dueTonight));

    expect(await pressOnTask("done", "pay")).toBe(true);
    expect(await pressOnTask("done", "pay")).toBe(true);

    expect((await listTasks(db))[0]).toMatchObject({
      value: 1,
      completedOn: TODAY,
    });
  });

  test("adds the increment to a quantitative task", async () => {
    await saveTask(
      db,
      task("water", {
        ...dueTonight,
        type: "quantitative",
        target: 2,
        unit: "L",
        increment: 0.25,
        value: 1,
      }),
    );

    await pressOnTask("add", "water");

    expect((await listTasks(db))[0].value).toBe(1.25);
  });

  test("does nothing if the task is closed, deleted or the alert was tapped", async () => {
    await saveTask(db, task("pay", dueTonight));
    const late = { date: TODAY, time: localTime("23:00") };

    expect(await pressOnTask("done", "pay", late)).toBe(false);
    expect(await pressOnTask("done", "gone")).toBe(false);
    expect(await pressOnTask(null, "pay")).toBe(false);
    expect((await listTasks(db))[0].value).toBe(0);
  });
});

describe("answerReminder", () => {
  test("Hecho marks a boolean habit done (RF-25)", async () => {
    const { answered } = press("done", "meditate");

    expect(await answered).toBe(true);
    expect(await valueOf("meditate")).toBe(1);
  });

  test("Hecho never unmarks a habit already done", async () => {
    await saveEntry(db, {
      id: "e1",
      habitId: "meditate",
      date: TODAY,
      value: 1,
    });

    await press("done", "meditate").answered;

    expect(await listEntries(db, TODAY, TODAY)).toEqual([
      expect.objectContaining({ id: "e1", value: 1 }),
    ]);
  });

  test("the increment button adds it to a quantitative habit (RF-25)", async () => {
    await saveEntry(db, { id: "e1", habitId: "water", date: TODAY, value: 1 });

    expect(await press("add", "water").answered).toBe(true);

    expect(await valueOf("water")).toBe(1.25);
  });

  test("records on the day of the reminder, even if it is answered the day after", async () => {
    const yesterday = localDate("2026-11-11");

    await press("done", "meditate", { date: yesterday }).answered;

    expect(await valueOf("meditate", yesterday)).toBe(1);
    expect(await valueOf("meditate")).toBeUndefined();
  });

  test("records nothing on a future day (RF-20)", async () => {
    const tomorrow = localDate("2026-11-13");

    expect(await press("done", "meditate", { date: tomorrow }).answered).toBe(
      false,
    );
    expect(await valueOf("meditate", tomorrow)).toBeUndefined();
  });

  test("records nothing for a habit deleted or archived since", async () => {
    await saveHabit(
      db,
      habit("meditate", { archivedOn: localDate("2026-11-10") }),
    );

    expect(await press("done", "meditate").answered).toBe(false);
    expect(await valueOf("meditate")).toBeUndefined();
  });

  test("Posponer warns again in an hour, with the same content (RF-25)", async () => {
    const { answered, notifications } = press("snooze", "meditate");

    expect(await answered).toBe(false);
    const [snoozed] = notifications.values();
    expect(snoozed).toEqual({
      ...reminderOf("meditate"),
      id: "snooze.meditate.2026-11-12.22:05",
      at: { date: TODAY, time: "22:05" },
    });
    expect(signatureOf(snoozed)).toBeTruthy();
  });

  test("Posponer does nothing if the hour falls on the next day (RF-25)", async () => {
    const lateNight = { date: TODAY, time: localTime("23:30") };

    const { answered, notifications } = press("snooze", "meditate", {
      now: lateNight,
    });

    await answered;
    expect(notifications.size).toBe(0);
  });

  test("Posponer does nothing for a reminder of another day", async () => {
    const yesterday = localDate("2026-11-11");
    const { answered, notifications } = press("snooze", "meditate", {
      date: yesterday,
    });

    await answered;
    expect(notifications.size).toBe(0);
  });

  test("tapping the reminder itself only opens the app (RF-26)", async () => {
    expect(await press(null, "meditate").answered).toBe(false);
    expect(await listEntries(db, TODAY, TODAY)).toEqual([]);
  });

  test("ignores a button it does not know", async () => {
    expect(await press("other", "meditate").answered).toBe(false);
  });
});

describe("onReminderRecorded", () => {
  test("calls the listeners until they stop", () => {
    const listener = jest.fn();
    const stop = onReminderRecorded(listener);

    notifyReminderRecorded();
    stop();
    notifyReminderRecorded();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
