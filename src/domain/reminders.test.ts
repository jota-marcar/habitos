import { localDate } from "./dates";
import type { Entry } from "./entries";
import type { Habit, HabitVersion } from "./habits";
import {
  MAX_UPCOMING_REMINDERS,
  SNOOZE_MINUTES,
  addReminder,
  removeReminder,
  snoozedTime,
  upcomingReminders,
  type Reminder,
  type UpcomingReminder,
} from "./reminders";
import { EVERY_DAY, scheduledDaysFrom } from "./schedule";
import { localTime } from "./times";

// 2026-11-09 is a Monday.
const MONDAY = localDate("2026-11-09");
const TUESDAY = localDate("2026-11-10");
const WEDNESDAY = localDate("2026-11-11");
const CREATED = localDate("2026-11-01");

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    type: "boolean",
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
  return {
    id: `${habitId}/${date}`,
    habitId,
    date: localDate(date),
    value,
  };
}

function at(date: string, time: string) {
  return { date: localDate(date), time: localTime(time) };
}

// "2026-11-09 08:00 meditate" is easier to read in an assertion than the whole object.
function summary(upcoming: readonly UpcomingReminder[]): string[] {
  return upcoming.map(
    (u) => `${u.date} ${u.reminder.time} ${u.reminder.habitId}`,
  );
}

describe("addReminder", () => {
  test("adds a reminder to those of the habit", () => {
    const first = reminder("meditate", "08:00");
    const second = reminder("meditate", "21:00");

    const result = addReminder([first], second);

    expect(result).toEqual({ ok: true, value: [first, second] });
  });

  test("a habit can start with no reminders", () => {
    const first = reminder("meditate", "08:00");

    expect(addReminder([], first)).toEqual({ ok: true, value: [first] });
  });

  test("rejects a second reminder at the same time", () => {
    const first = reminder("meditate", "08:00");
    const repeated = { ...reminder("meditate", "08:00"), id: "another" };

    expect(addReminder([first], repeated)).toEqual({
      ok: false,
      errors: ["time_duplicated"],
    });
  });
});

describe("removeReminder", () => {
  test("removes the reminder with that identifier", () => {
    const first = reminder("meditate", "08:00");
    const second = reminder("meditate", "21:00");

    expect(removeReminder([first, second], first.id)).toEqual([second]);
  });

  test("changes nothing if the reminder is not there", () => {
    const first = reminder("meditate", "08:00");

    expect(removeReminder([first], "missing")).toEqual([first]);
  });
});

describe("snoozedTime", () => {
  test("snoozes for one hour", () => {
    expect(SNOOZE_MINUTES).toBe(60);
    expect(snoozedTime(localTime("08:15"))).toBe("09:15");
  });

  test("still snoozes when the new time is the last minute of the day", () => {
    expect(snoozedTime(localTime("22:59"))).toBe("23:59");
  });

  test("does not snooze into the next day", () => {
    expect(snoozedTime(localTime("23:00"))).toBeNull();
    expect(snoozedTime(localTime("23:30"))).toBeNull();
  });
});

describe("upcomingReminders", () => {
  const meditate = habit("meditate");
  const base = {
    habits: [meditate],
    versions: [version("meditate")],
    entries: [],
    reminders: [reminder("meditate", "08:00"), reminder("meditate", "21:00")],
  };

  test("lists the reminders after now, soonest first", () => {
    const upcoming = upcomingReminders(base, at(MONDAY, "07:00"), 5);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${MONDAY} 21:00 meditate`,
      `${TUESDAY} 08:00 meditate`,
      `${TUESDAY} 21:00 meditate`,
      `${WEDNESDAY} 08:00 meditate`,
    ]);
  });

  test("skips the reminders of today that have already passed", () => {
    const upcoming = upcomingReminders(base, at(MONDAY, "12:00"), 2);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 21:00 meditate`,
      `${TUESDAY} 08:00 meditate`,
    ]);
  });

  test("a reminder at this very minute has already warned", () => {
    const upcoming = upcomingReminders(base, at(MONDAY, "08:00"), 1);

    expect(summary(upcoming)).toEqual([`${MONDAY} 21:00 meditate`]);
  });

  test("orders by time whatever the order of the reminders", () => {
    const data = {
      ...base,
      reminders: [reminder("meditate", "21:00"), reminder("meditate", "08:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 2);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${MONDAY} 21:00 meditate`,
    ]);
  });

  test("reminders at the same minute keep the order they were given in", () => {
    const data = {
      habits: [habit("read"), meditate],
      versions: [version("read"), version("meditate")],
      entries: [],
      reminders: [reminder("meditate", "08:00"), reminder("read", "08:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 2);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${MONDAY} 08:00 read`,
    ]);
  });

  test("only warns on the scheduled days of the habit (RF-23)", () => {
    const data = {
      ...base,
      versions: [
        version("meditate", { scheduledDays: scheduledDaysFrom([0, 2]) }),
      ],
      reminders: [reminder("meditate", "08:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 3);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${WEDNESDAY} 08:00 meditate`,
      `2026-11-16 08:00 meditate`,
    ]);
  });

  test("does not warn today if the habit is already done (RF-24)", () => {
    const data = { ...base, entries: [entry("meditate", MONDAY, 1)] };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 2);

    expect(summary(upcoming)).toEqual([
      `${TUESDAY} 08:00 meditate`,
      `${TUESDAY} 21:00 meditate`,
    ]);
  });

  test("a quantitative habit in progress still warns, with its progress (RF-24)", () => {
    const data = {
      habits: [habit("water", { type: "quantitative" })],
      versions: [version("water", { target: 2, unit: "L", increment: 0.25 })],
      entries: [entry("water", MONDAY, 1)],
      reminders: [reminder("water", "12:00")],
    };

    const [first, second] = upcomingReminders(data, at(MONDAY, "07:00"), 2);

    expect(first.date).toBe(MONDAY);
    expect(first.dayHabit.value).toBe(1);
    expect(first.dayHabit.version.target).toBe(2);
    expect(first.dayHabit.version.unit).toBe("L");
    expect(first.dayHabit.done).toBe(false);
    // Tomorrow starts from zero.
    expect(second.date).toBe(TUESDAY);
    expect(second.dayHabit.value).toBe(0);
  });

  test("a quantitative habit that reached its target does not warn today", () => {
    const data = {
      habits: [habit("water", { type: "quantitative" })],
      versions: [version("water", { target: 2, unit: "L", increment: 0.25 })],
      entries: [entry("water", MONDAY, 2)],
      reminders: [reminder("water", "12:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 1);

    expect(summary(upcoming)).toEqual([`${TUESDAY} 12:00 water`]);
  });

  test("an archived habit never warns, even on the day it is archived (RF-10)", () => {
    const data = {
      ...base,
      habits: [habit("meditate", { archivedOn: MONDAY })],
      // In progress on the archive day: it still shows that day, but must not warn.
      entries: [entry("meditate", MONDAY, 0.5)],
    };

    expect(upcomingReminders(data, at(MONDAY, "07:00"))).toEqual([]);
  });

  test("a habit without reminders gives nothing", () => {
    const data = { ...base, reminders: [] };

    expect(upcomingReminders(data, at(MONDAY, "07:00"))).toEqual([]);
  });

  test("ignores the reminders of a habit that is not in the data", () => {
    const data = { ...base, reminders: [reminder("deleted", "08:00")] };

    expect(upcomingReminders(data, at(MONDAY, "07:00"))).toEqual([]);
  });

  test("uses the version in force each day", () => {
    const data = {
      ...base,
      versions: [
        version("meditate"),
        version("meditate", {
          id: "meditate-v2",
          effectiveFrom: TUESDAY,
          scheduledDays: scheduledDaysFrom([2]),
        }),
      ],
      reminders: [reminder("meditate", "08:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "07:00"), 2);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${WEDNESDAY} 08:00 meditate`,
    ]);
  });

  test("finds a weekly habit whose reminder of today has already passed", () => {
    const data = {
      ...base,
      versions: [
        version("meditate", { scheduledDays: scheduledDaysFrom([0]) }),
      ],
      reminders: [reminder("meditate", "08:00")],
    };

    const upcoming = upcomingReminders(data, at(MONDAY, "23:00"), 2);

    expect(summary(upcoming)).toEqual([
      `2026-11-16 08:00 meditate`,
      `2026-11-23 08:00 meditate`,
    ]);
  });

  test("fills the window by default and never goes beyond it", () => {
    const upcoming = upcomingReminders(base, at(MONDAY, "07:00"));

    expect(MAX_UPCOMING_REMINDERS).toBe(60);
    expect(upcoming).toHaveLength(60);
    // Two a day: the window covers 30 days.
    expect(upcoming[59].date).toBe("2026-12-08");
    expect(upcoming[59].reminder.time).toBe("21:00");
  });

  test("cuts a day in half when the limit falls in the middle of it", () => {
    const upcoming = upcomingReminders(base, at(MONDAY, "07:00"), 3);

    expect(summary(upcoming)).toEqual([
      `${MONDAY} 08:00 meditate`,
      `${MONDAY} 21:00 meditate`,
      `${TUESDAY} 08:00 meditate`,
    ]);
  });

  test("a limit of zero gives nothing", () => {
    expect(upcomingReminders(base, at(MONDAY, "07:00"), 0)).toEqual([]);
  });
});
