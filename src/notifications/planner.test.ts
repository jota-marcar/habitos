import { saveEntry } from "@/data/entries-repository";
import { addHabit } from "@/data/habits-repository";
import { habit, openMigratedDatabase, version } from "@/data/testing/fixtures";
import type { TestDatabase } from "@/data/testing/node-database";
import { localDate } from "@/domain/dates";
import { localTime, type LocalDateTime } from "@/domain/times";

import type {
  Notifier,
  PlannedNotification,
  ScheduledNotification,
} from "./notifier";
import {
  instantOf,
  localDateTimeOf,
  plannedNotifications,
  serialized,
  signatureOf,
  syncNotifications,
} from "./planner";

let db: TestDatabase;

// Thursday, 12 November 2026, after the habits of the fixtures are created.
const NOW: LocalDateTime = {
  date: localDate("2026-11-12"),
  time: localTime("10:00"),
};

function reminder(habitId: string, time: string) {
  return { id: `${habitId}@${time}`, habitId, time: localTime(time) };
}

/** A notifier that keeps the scheduled notifications in memory and logs what it is asked. */
function fakeNotifier(initial: ScheduledNotification[] = []) {
  const scheduled = new Map(initial.map((n) => [n.id, n.signature]));
  const log: string[] = [];
  const notifier: Notifier = {
    scheduled: async () =>
      [...scheduled].map(([id, signature]) => ({ id, signature })),
    schedule: async (notification, signature) => {
      log.push(`schedule ${notification.id}`);
      scheduled.set(notification.id, signature);
    },
    cancel: async (id) => {
      log.push(`cancel ${id}`);
      scheduled.delete(id);
    },
  };
  return { notifier, scheduled, log };
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

describe("plannedNotifications", () => {
  test("a boolean habit warns with its name only", async () => {
    await addHabit(
      db,
      habit("meditate", { name: "Meditar" }),
      version("meditate"),
      [reminder("meditate", "21:00")],
    );

    const [first] = await plannedNotifications(db, NOW);

    expect(first).toEqual({
      id: "reminder.meditate@21:00.2026-11-12",
      at: { date: "2026-11-12", time: "21:00" },
      title: "Meditar",
      body: null,
      habitId: "meditate",
    });
  });

  test("a quantitative habit says how it is going that day (RF-24)", async () => {
    await addHabit(
      db,
      habit("water", { name: "Beber agua", type: "quantitative" }),
      version("water", { target: 2, unit: "L", increment: 0.25 }),
      [reminder("water", "18:00")],
    );
    await saveEntry(db, {
      id: "e1",
      habitId: "water",
      date: NOW.date,
      value: 1.25,
    });

    const [today, tomorrow] = await plannedNotifications(db, NOW);

    expect(today.body).toBe("Llevas 1,25 de 2 L");
    expect(tomorrow.body).toBe("Llevas 0 de 2 L");
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

    const [first] = await plannedNotifications(db, NOW);

    expect(first.at).toEqual({ date: "2026-11-13", time: "22:00" });
  });

  test("a quantitative habit with no unit only shows the amounts", async () => {
    await addHabit(
      db,
      habit("push-ups", { type: "quantitative" }),
      version("push-ups", { target: 20, unit: null, increment: 5 }),
      [reminder("push-ups", "18:00")],
    );

    const [first] = await plannedNotifications(db, NOW);

    expect(first.body).toBe("Llevas 0 de 20");
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
    };
  }

  test("schedules the planned notifications that are missing", async () => {
    const { notifier, scheduled } = fakeNotifier();

    await syncNotifications(notifier, [planned("a"), planned("b")]);

    expect([...scheduled.keys()]).toEqual(["reminder.a", "reminder.b"]);
    expect(scheduled.get("reminder.a")).toBe(signatureOf(planned("a")));
  });

  test("leaves alone those already scheduled as planned", async () => {
    const { notifier, log } = fakeNotifier([
      { id: "reminder.a", signature: signatureOf(planned("a")) },
    ]);

    await syncNotifications(notifier, [planned("a")]);

    expect(log).toEqual([]);
  });

  test("schedules again those that have changed", async () => {
    const { notifier, scheduled, log } = fakeNotifier([
      { id: "reminder.a", signature: signatureOf(planned("a", "08:00")) },
    ]);

    await syncNotifications(notifier, [planned("a", "09:00")]);

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

    await syncNotifications(notifier, [planned("a")]);

    expect([...scheduled.keys()]).toEqual(["reminder.a"]);
  });

  test("leaves alone the notifications that are not reminders of the window", async () => {
    const { notifier, log } = fakeNotifier([
      { id: "snooze.a", signature: null },
    ]);

    await syncNotifications(notifier, []);

    expect(log).toEqual([]);
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
