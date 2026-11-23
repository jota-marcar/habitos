import { localDate } from "./dates";
import {
  PENDING_DIGEST_TIMES,
  upcomingPendingDigests,
  type PendingDigest,
} from "./digests";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import type { Reminder } from "./reminders";
import { EVERY_DAY, scheduledDaysFrom } from "./schedule";
import { localTime } from "./times";

// 2026-11-09 is a Monday.
const CREATED = localDate("2026-11-01");

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    type: "boolean",
    color: null,
    createdOn: CREATED,
    archivedOn: null,
    ...overrides,
  };
}

function version(
  habitId: string,
  overrides: Partial<HabitVersion> = {},
): HabitVersion {
  return {
    id: `${habitId}-v1`,
    habitId,
    effectiveFrom: CREATED,
    scheduledDays: EVERY_DAY,
    target: null,
    unit: null,
    increment: null,
    ...overrides,
  };
}

function reminder(habitId: string, time: string): Reminder {
  return { id: `${habitId}@${time}`, habitId, time: localTime(time) };
}

function entry(habitId: string, date: string, value: number): Entry {
  return { id: `${habitId}/${date}`, habitId, date: localDate(date), value };
}

function at(date: string, time: string) {
  return { date: localDate(date), time: localTime(time) };
}

// "2026-11-09 17:00 read,run" is easier to read in an assertion than the whole object.
function summary(digests: readonly PendingDigest[]): string[] {
  return digests.map(
    (d) => `${d.date} ${d.time} ${d.habits.map((h) => h.habit.id).join(",")}`,
  );
}

const read = { habits: [habit("read")], versions: [version("read")] };

describe("upcomingPendingDigests", () => {
  test("warns twice a day, at fixed times (RF-37)", () => {
    expect(PENDING_DIGEST_TIMES).toEqual(["17:00", "22:00"]);
  });

  test("warns every day with pending habits, from the next time of today", () => {
    const digests = upcomingPendingDigests(
      { ...read, entries: [], reminders: [] },
      at("2026-11-09", "18:00"),
      3,
    );

    expect(summary(digests)).toEqual([
      "2026-11-09 22:00 read",
      "2026-11-10 17:00 read",
      "2026-11-10 22:00 read",
    ]);
  });

  test("a time that is now has already passed", () => {
    const digests = upcomingPendingDigests(
      { ...read, entries: [], reminders: [] },
      at("2026-11-09", "17:00"),
      1,
    );

    expect(summary(digests)).toEqual(["2026-11-09 22:00 read"]);
  });

  test("names only the habits not done, in progress or not", () => {
    const digests = upcomingPendingDigests(
      {
        habits: [
          habit("read"),
          habit("meditate"),
          habit("water", { type: "quantitative" }),
          habit("steps", { type: "quantitative" }),
        ],
        versions: [
          version("read"),
          version("meditate"),
          version("water", { target: 2, unit: "L", increment: 0.25 }),
          version("steps", { target: 8000, unit: "pasos", increment: 1000 }),
        ],
        entries: [
          entry("meditate", "2026-11-09", 1),
          entry("water", "2026-11-09", 1),
          entry("steps", "2026-11-09", 8000),
        ],
        reminders: [],
      },
      at("2026-11-09", "08:00"),
      1,
    );

    expect(summary(digests)).toEqual(["2026-11-09 17:00 read,water"]);
  });

  test("a day with everything done has no digests", () => {
    const digests = upcomingPendingDigests(
      { ...read, entries: [entry("read", "2026-11-09", 1)], reminders: [] },
      at("2026-11-09", "08:00"),
      1,
    );

    expect(summary(digests)).toEqual(["2026-11-10 17:00 read"]);
  });

  test("only the scheduled days have digests", () => {
    const digests = upcomingPendingDigests(
      {
        habits: [habit("run")],
        // Mondays only.
        versions: [version("run", { scheduledDays: scheduledDaysFrom([0]) })],
        entries: [],
        reminders: [],
      },
      at("2026-11-09", "20:00"),
      2,
    );

    expect(summary(digests)).toEqual([
      "2026-11-09 22:00 run",
      "2026-11-16 17:00 run",
    ]);
  });

  test("archived habits do not count", () => {
    const digests = upcomingPendingDigests(
      {
        habits: [habit("read", { archivedOn: localDate("2026-11-05") })],
        versions: [version("read")],
        entries: [],
        reminders: [],
      },
      at("2026-11-09", "08:00"),
    );

    expect(digests).toEqual([]);
  });

  test("stops looking after a whole week without digests", () => {
    const digests = upcomingPendingDigests(
      { habits: [], versions: [], entries: [], reminders: [] },
      at("2026-11-09", "08:00"),
    );

    expect(digests).toEqual([]);
  });

  test("reaches a habit that starts more than a week from now", () => {
    const starts = localDate("2026-12-01");
    const data = {
      habits: [habit("read", { createdOn: starts })],
      versions: [version("read", { effectiveFrom: starts })],
      entries: [],
      reminders: [],
    };

    const digests = upcomingPendingDigests(data, at("2026-11-09", "07:00"), 1);

    expect(summary(digests)).toEqual(["2026-12-01 17:00 read"]);
  });

  test("names the habits in the order the day view shows at that time (RF-12)", () => {
    const digests = upcomingPendingDigests(
      {
        habits: [habit("none"), habit("evening"), habit("morning")],
        versions: [version("none"), version("evening"), version("morning")],
        entries: [],
        reminders: [reminder("evening", "20:00"), reminder("morning", "09:00")],
      },
      at("2026-11-09", "08:00"),
      2,
    );

    expect(summary(digests)).toEqual([
      // At 17:00 the morning one is overdue and the evening one is still to come.
      "2026-11-09 17:00 morning,evening,none",
      // At 22:00 both are overdue, by their last reminder.
      "2026-11-09 22:00 morning,evening,none",
    ]);
  });

  test("gives as many digests as the limit at most", () => {
    const digests = upcomingPendingDigests(
      { ...read, entries: [], reminders: [] },
      at("2026-11-09", "08:00"),
    );

    expect(digests).toHaveLength(60);
    expect(digests[59].date).toBe("2026-12-08");
  });
});
