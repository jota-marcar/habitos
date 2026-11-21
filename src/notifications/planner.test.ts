import { saveEntry } from "@/data/entries-repository";
import { addHabit } from "@/data/habits-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate } from "@/domain/dates";
import type { DayHabit } from "@/domain/day";
import type { PendingDigest } from "@/domain/digests";
import { localTime, type LocalDateTime } from "@/domain/times";

import type { PlannedNotification } from "./notifier";
import {
  REMINDER_PREFIX,
  categoryOf,
  digestNotification,
  instantOf,
  localDateTimeOf,
  planReminders,
  serialized,
  signatureOf,
  snoozedNotification,
  syncNotifications,
  windowOf,
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

/** The plan at NOW with the reminders only, without the pending digests. */
async function remindersPlanned(): Promise<ReminderPlan> {
  const plan = await planReminders(db, NOW);
  return {
    ...plan,
    notifications: plan.notifications.filter((n) =>
      n.id.startsWith(REMINDER_PREFIX),
    ),
  };
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

    const { notifications, categories } = await remindersPlanned();

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
    } = await remindersPlanned();

    expect(today.body).toBe("Llevas 1,25 de 2 L");
    expect(tomorrow.body).toBe("Llevas 0 de 2 L");
  });

  test("a quantitative habit has a button with its own increment (RF-25)", async () => {
    await addWater();

    const { notifications, categories } = await remindersPlanned();

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

    const { notifications, pendingToday } = await remindersPlanned();

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

    const { notifications, categories } = await remindersPlanned();

    expect(notifications[0].body).toBe("Llevas 0 de 20");
    expect(categories[0].buttons[0].title).toBe("+5");
  });

  test("lists the habits still pending today", async () => {
    await addWater();

    const { today, pendingToday } = await planReminders(db, NOW);

    expect(today).toBe(NOW.date);
    expect([...pendingToday]).toEqual(["water"]);
  });

  test("warns of the pending habits at 17:00 and 22:00, among the reminders (RF-37)", async () => {
    await addWater();
    await addHabit(
      db,
      habit("meditate", { name: "Meditar" }),
      version("meditate"),
    );

    const { notifications } = await planReminders(db, NOW);

    expect(notifications.slice(0, 3).map((n) => n.id)).toEqual([
      "digest.2026-11-12.17:00",
      "reminder.water@18:00.2026-11-12",
      "digest.2026-11-12.22:00",
    ]);
    expect(notifications[0]).toEqual({
      id: "digest.2026-11-12.17:00",
      at: { date: "2026-11-12", time: "17:00" },
      title: "Te quedan 2 hábitos",
      body: "Beber agua y Meditar",
      habitId: null,
      category: null,
    });
  });

  test("does not warn of today's pending habits once all are done (RF-37)", async () => {
    await addHabit(db, habit("read"), version("read"));
    await saveEntry(db, {
      id: "e1",
      habitId: "read",
      date: NOW.date,
      value: 1,
    });

    const { notifications } = await planReminders(db, NOW);

    expect(notifications[0].id).toBe("digest.2026-11-13.17:00");
  });
});

describe("digestNotification", () => {
  function digest(...names: string[]): PendingDigest {
    const habits = names.map((name, index): DayHabit => ({
      habit: habit(`h${index}`, { name }),
      version: version(`h${index}`),
      value: 0,
      done: false,
    }));
    return { date: NOW.date, time: localTime("22:00"), habits };
  }

  test("names the only habit left", () => {
    const notification = digestNotification(digest("Leer"));

    expect(notification.title).toBe("Te queda 1 hábito");
    expect(notification.body).toBe("Leer");
  });

  test("names up to three habits, and counts the rest", () => {
    expect(digestNotification(digest("Leer", "Correr", "Meditar")).body).toBe(
      "Leer, Correr y Meditar",
    );
    expect(
      digestNotification(digest("Leer", "Correr", "Meditar", "Agua", "Yoga")),
    ).toMatchObject({
      title: "Te quedan 5 hábitos",
      body: "Leer, Correr, Meditar y 2 más",
    });
  });

  test("shortens the long names, without cutting an emoji in half", () => {
    const notification = digestNotification(
      digest(" Leer ", "Repasar el vocabulario de inglés 📚", "Correr 🏃"),
    );

    expect(notification.body).toBe(
      "Leer, Repasar el vocabulario d… y Correr 🏃",
    );
    expect(
      digestNotification(
        digest("Leer", "🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃"),
      ).body,
    ).toBe("Leer y 🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃🏃…");
  });

  test('says "e" before a word that sounds like "i"', () => {
    expect(digestNotification(digest("Leer", "Ir al gimnasio")).body).toBe(
      "Leer e Ir al gimnasio",
    );
    expect(digestNotification(digest("Leer", "hidratarse")).body).toBe(
      "Leer e hidratarse",
    );
    expect(digestNotification(digest("Leer", "Hierro")).body).toBe(
      "Leer y Hierro",
    );
  });
});

describe("windowOf", () => {
  function at(id: string, date: string, time: string): PlannedNotification {
    return {
      id,
      at: { date: localDate(date), time: localTime(time) },
      title: id,
      body: null,
      habitId: null,
      category: null,
    };
  }

  test("puts reminders and digests together, soonest first, reminders first at the same minute", () => {
    const window = windowOf(
      [at("r1", "2026-11-12", "17:00"), at("r2", "2026-11-13", "08:00")],
      [
        at("d1", "2026-11-12", "17:00"),
        at("d2", "2026-11-12", "22:00"),
        at("d3", "2026-11-13", "17:00"),
      ],
    );

    expect(window.map((n) => n.id)).toEqual(["r1", "d1", "d2", "r2", "d3"]);
  });

  test("keeps as many as fit in the window (ADR-0005)", () => {
    const reminders = Array.from({ length: 40 }, (_, i) =>
      at(`r${i}`, "2026-11-12", "08:00"),
    );
    const digests = Array.from({ length: 40 }, (_, i) =>
      at(`d${i}`, "2026-11-13", "17:00"),
    );

    const window = windowOf(reminders, digests);

    expect(window).toHaveLength(60);
    expect(window[59].id).toBe("d19");
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
      gestureHintStartedOn: null,
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

    // Replaced without cancelling: if iOS suspends the app, no reminder is lost.
    expect(log).toEqual(["schedule reminder.a"]);
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

  test("cancels the pending digests that no longer warn (RF-37)", async () => {
    const { notifier, scheduled } = fakeNotifier([
      { id: "digest.2026-11-12.17:00", signature: null },
    ]);

    await syncNotifications(notifier, plan([]));

    expect(scheduled.size).toBe(0);
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

  test("no longer explains the gesture, because a button has just been used", () => {
    const original: PlannedNotification = {
      id: "reminder.r1.2026-11-12",
      at: NOW,
      title: "Beber agua",
      body: "Llevas 1 de 2 L\nMantén pulsado para sumar o posponerlo",
      habitId: "water",
      category: "reminder_add_water",
    };
    const hintOnly = {
      ...original,
      body: "Mantén pulsado para marcarlo o posponerlo",
    };
    const at = { date: NOW.date, time: localTime("11:00") };

    expect(snoozedNotification(original, at).body).toBe("Llevas 1 de 2 L");
    expect(snoozedNotification(hintOnly, at).body).toBeNull();
  });
});

describe("gesture hint (RF-25)", () => {
  const NEW_HINT = { startedOn: null, learned: false };

  async function addRead() {
    await addHabit(db, habit("read", { name: "Leer" }), version("read"), [
      reminder("read", "21:00"),
    ]);
  }

  function reminderBodies(plan: ReminderPlan) {
    return plan.notifications
      .filter((n) => n.id.startsWith(REMINDER_PREFIX))
      .map((n) => n.body);
  }

  test("a boolean reminder explains the gesture from its first day", async () => {
    await addRead();

    const plan = await planReminders(db, NOW, NEW_HINT);

    expect(plan.gestureHintStartedOn).toBe("2026-11-12");
    expect(reminderBodies(plan)[0]).toBe(
      "Mantén pulsado para marcarlo o posponerlo",
    );
  });

  test("a quantitative reminder explains it after its progress", async () => {
    await addWater();

    const plan = await planReminders(db, NOW, NEW_HINT);

    expect(reminderBodies(plan)[0]).toBe(
      "Llevas 0 de 2 L\nMantén pulsado para sumar o posponerlo",
    );
  });

  test("stops after seven days, counted from the first reminder", async () => {
    await addRead();

    const plan = await planReminders(db, NOW, NEW_HINT);
    const bodies = reminderBodies(plan);

    expect(bodies.slice(0, 7).every((body) => body !== null)).toBe(true);
    expect(bodies[7]).toBeNull();
  });

  test("keeps the day it started on", async () => {
    await addRead();

    const plan = await planReminders(db, NOW, {
      startedOn: localDate("2026-11-06"),
      learned: false,
    });

    expect(plan.gestureHintStartedOn).toBe("2026-11-06");
    expect(reminderBodies(plan)[0]).not.toBeNull();
    expect(reminderBodies(plan)[1]).toBeNull();
  });

  test("does not start without reminders", async () => {
    const plan = await planReminders(db, NOW, NEW_HINT);

    expect(plan.gestureHintStartedOn).toBeNull();
  });

  test("disappears once a button has been used", async () => {
    await addRead();

    const plan = await planReminders(db, NOW, {
      startedOn: NOW.date,
      learned: true,
    });

    expect(reminderBodies(plan).every((body) => body === null)).toBe(true);
  });

  test("the digests never explain it, because they have no buttons", async () => {
    await addRead();

    const plan = await planReminders(db, NOW, NEW_HINT);
    const digest = plan.notifications.find((n) => n.habitId === null);

    expect(digest?.body).toBe("Leer");
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
