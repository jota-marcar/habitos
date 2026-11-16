import { saveEntry } from "@/data/entries-repository";
import { addHabit } from "@/data/habits-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate } from "@/domain/dates";
import { localTime, type LocalDateTime } from "@/domain/times";

import type { PlannedNotification } from "./notifier";
import {
  categoryOf,
  instantOf,
  localDateTimeOf,
  planReminders,
  serialized,
  signatureOf,
  snoozedNotification,
  syncNotifications,
  type ReminderPlan,
} from "./planner";
import { fakeNotifier } from "./testing/fake-notifier";

let db: TestDatabase;

// Thursday, 12 November 2026, after the habits of the fixtures are created.
const NOW: LocalDateTime = {
  date: localDate("2026-11-12"),
  time: localTime("10:00"),
};

function reminder(habitId: string, time: string) {
  return { id: `${habitId}@${time}`, habitId, time: localTime(time) };
}

function addWater() {
  return addHabit(
    db,
    habit("water", { name: "Beber agua", type: "quantitative" }),
    version("water", { target: 2, unit: "L", increment: 0.25 }),
    [reminder("water", "18:00")],
  );
}

beforeEach(async () => {
  db = await openMigratedDatabase();
});

afterEach(() => {
  db.close();
});

describe("localDateTimeOf and instantOf", () => {
  test("go from an instant to its local minute and back", () => {
    const instant = new Date(2026, 10, 12, 8, 30, 45);

    const minute = localDateTimeOf(instant);

    expect(minute).toEqual({ date: "2026-11-12", time: "08:30" });
    expect(instantOf(minute)).toEqual(new Date(2026, 10, 12, 8, 30));
  });
});

describe("planReminders", () => {
  test("a boolean habit warns with its name only, with the buttons of its type", async () => {
    await addHabit(
      db,
      habit("meditate", { name: "Meditar" }),
      version("meditate"),
      [reminder("meditate", "21:00")],
    );

    const { notifications, categories } = await planReminders(db, NOW);

    expect(notifications[0]).toEqual({
      id: "reminder.meditate@21:00.2026-11-12",
      at: { date: "2026-11-12", time: "21:00" },
      title: "Meditar",
      body: null,
      habitId: "meditate",
      category: "reminder_boolean",
    });
    expect(categories).toEqual([
      {
        id: "reminder_boolean",
        buttons: [
          { id: "done", title: "Hecho" },
          { id: "snooze", title: "Posponer 1 h" },
        ],
      },
    ]);
  });

  test("a quantitative habit says how it is going that day (RF-24)", async () => {
    await addWater();
    await saveEntry(db, {
      id: "e1",
      habitId: "water",
      date: NOW.date,
      value: 1.25,
    });

    const {
      notifications: [today, tomorrow],
    } = await planReminders(db, NOW);

    expect(today.body).toBe("Llevas 1,25 de 2 L");
    expect(tomorrow.body).toBe("Llevas 0 de 2 L");
  });

  test("a quantitative habit has a button with its own increment (RF-25)", async () => {
    await addWater();

    const { notifications, categories } = await planReminders(db, NOW);

    expect(notifications[0].category).toBe("reminder_add_water");
    expect(categories).toEqual([
      {
        id: "reminder_add_water",
        buttons: [
          { id: "add", title: "+0,25 L" },
          { id: "snooze", title: "Posponer 1 h" },
        ],
      },
    ]);
  });

  test("a habit done today stops warning today, but not tomorrow (RF-24)", async () => {
    await addHabit(db, habit("read"), version("read"), [
      reminder("read", "22:00"),
    ]);
    await saveEntry(db, {
      id: "e1",
      habitId: "read",
      date: NOW.date,
      value: 1,
    });

    const { notifications, pendingToday } = await planReminders(db, NOW);

    expect(notifications[0].at).toEqual({ date: "2026-11-13", time: "22:00" });
    expect(pendingToday.has("read")).toBe(false);
  });

  test("a quantitative habit with no unit only shows the amounts", async () => {
    await addHabit(
      db,
      habit("push-ups", { type: "quantitative" }),
      version("push-ups", { target: 20, unit: null, increment: 5 }),
      [reminder("push-ups", "18:00")],
    );

    const { notifications, categories } = await planReminders(db, NOW);

    expect(notifications[0].body).toBe("Llevas 0 de 20");
    expect(categories[0].buttons[0].title).toBe("+5");
  });

  test("lists the habits still pending today", async () => {
    await addWater();

    const { today, pendingToday } = await planReminders(db, NOW);

    expect(today).toBe(NOW.date);
    expect([...pendingToday]).toEqual(["water"]);
  });
});

describe("categoryOf", () => {
  test("leaves out of the identifier the characters iOS does not allow", () => {
    const id = "6f1c-4a:2b";

    expect(categoryOf(habit(id, { type: "quantitative" }))).toBe(
      "reminder_add_6f1c_4a_2b",
    );
  });
});

describe("syncNotifications", () => {
  function planned(id: string, time = "21:00"): PlannedNotification {
    return {
      id: `reminder.${id}`,
      at: { date: NOW.date, time: localTime(time) },
      title: id,
      body: null,
      habitId: id,
      category: "reminder_boolean",
    };
  }

  function plan(
    notifications: PlannedNotification[],
    changes: Partial<ReminderPlan> = {},
  ): ReminderPlan {
    return {
      notifications,
      categories: [],
      today: NOW.date,
      pendingToday: new Set(),
      ...changes,
    };
  }

  test("schedules the planned notifications that are missing", async () => {
    const { notifier, scheduled } = fakeNotifier();

    await syncNotifications(notifier, plan([planned("a"), planned("b")]));

    expect([...scheduled.keys()]).toEqual(["reminder.a", "reminder.b"]);
    expect(scheduled.get("reminder.a")).toBe(signatureOf(planned("a")));
  });

  test("leaves alone those already scheduled as planned", async () => {
    const { notifier, log } = fakeNotifier([
      { id: "reminder.a", signature: signatureOf(planned("a")) },
    ]);

    await syncNotifications(notifier, plan([planned("a")]));

    expect(log).toEqual([]);
  });

  test("schedules again those that have changed", async () => {
    const { notifier, scheduled, log } = fakeNotifier([
      { id: "reminder.a", signature: signatureOf(planned("a", "08:00")) },
    ]);

    await syncNotifications(notifier, plan([planned("a", "09:00")]));

    expect(log).toEqual(["cancel reminder.a", "schedule reminder.a"]);
    expect(scheduled.get("reminder.a")).toBe(
      signatureOf(planned("a", "09:00")),
    );
  });

  test("cancels the reminders that no longer warn", async () => {
    const { notifier, scheduled } = fakeNotifier([
      { id: "reminder.a", signature: signatureOf(planned("a")) },
      { id: "reminder.old", signature: null },
    ]);

    await syncNotifications(notifier, plan([planned("a")]));

    expect([...scheduled.keys()]).toEqual(["reminder.a"]);
  });

  test("keeps the snoozed reminders of habits still pending today", async () => {
    const { notifier, log } = fakeNotifier([
      { id: "snooze.a.2026-11-12.11:00", signature: null },
    ]);

    await syncNotifications(
      notifier,
      plan([], { pendingToday: new Set(["a"]) }),
    );

    expect(log).toEqual([]);
  });

  test("cancels the snoozed reminders of habits done, archived or deleted (RF-24)", async () => {
    const { notifier, scheduled } = fakeNotifier([
      { id: "snooze.a.2026-11-12.11:00", signature: null },
    ]);

    await syncNotifications(notifier, plan([]));

    expect(scheduled.size).toBe(0);
  });

  test("cancels the snoozed reminders of other days", async () => {
    const { notifier, scheduled } = fakeNotifier([
      { id: "snooze.a.2026-11-11.23:00", signature: null },
    ]);

    await syncNotifications(
      notifier,
      plan([], { pendingToday: new Set(["a"]) }),
    );

    expect(scheduled.size).toBe(0);
  });

  test("leaves alone the notifications that are not reminders", async () => {
    const { notifier, log } = fakeNotifier([{ id: "other", signature: null }]);

    await syncNotifications(notifier, plan([]));

    expect(log).toEqual([]);
  });

  test("registers the categories only when they are new or have changed", async () => {
    const { notifier, log } = fakeNotifier();
    const known = new Map<string, string>();
    const category = (title: string) => ({
      id: "reminder_add_water",
      buttons: [{ id: "add", title }],
    });

    await syncNotifications(
      notifier,
      plan([], { categories: [category("+1 L")] }),
      known,
    );
    await syncNotifications(
      notifier,
      plan([], { categories: [category("+1 L")] }),
      known,
    );
    await syncNotifications(
      notifier,
      plan([], { categories: [category("+2 L")] }),
      known,
    );

    expect(log).toEqual([
      "category reminder_add_water",
      "category reminder_add_water",
    ]);
  });
});

describe("snoozedNotification", () => {
  test("warns again like the original, with an identifier of its own", () => {
    const original: PlannedNotification = {
      id: "reminder.r1.2026-11-12",
      at: NOW,
      title: "Leer",
      body: null,
      habitId: "read",
      category: "reminder_boolean",
    };
    const at = { date: NOW.date, time: localTime("11:00") };

    expect(snoozedNotification(original, at)).toEqual({
      ...original,
      id: "snooze.read.2026-11-12.11:00",
      at,
    });
  });
});

describe("serialized", () => {
  test("runs one call at a time and merges those waiting to start", async () => {
    const started: number[] = [];
    let release: () => void = () => undefined;
    let runs = 0;
    const run = serialized(async () => {
      started.push(++runs);
      if (runs === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });

    const first = run();
    await Promise.resolve();
    const second = run();
    const third = run();
    expect(second).toBe(third);
    expect(started).toEqual([1]);

    release();
    await Promise.all([first, second, third]);
    expect(started).toEqual([1, 2]);
  });

  test("a failed call does not block the next ones", async () => {
    let fail = true;
    const run = serialized(async () => {
      if (fail) throw new Error("failed");
    });

    await expect(run()).rejects.toThrow("failed");
    fail = false;
    await expect(run()).resolves.toBeUndefined();
  });
});
