import { habitsForDay, isDone } from "./day";
import { localDate } from "./dates";
import type { Entry } from "./entries";
import type { Habit, HabitConfig, HabitVersion } from "./habits";
import { EVERY_DAY, scheduledDaysFrom } from "./schedule";

// 2026-10-26 is a Monday.
const monday = localDate("2026-10-26");
const tuesday = localDate("2026-10-27");
const wednesday = localDate("2026-10-28");

const booleanConfig: HabitConfig = {
  scheduledDays: EVERY_DAY,
  target: null,
  unit: null,
  increment: null,
};
const waterConfig: HabitConfig = {
  scheduledDays: EVERY_DAY,
  target: 2,
  unit: "L",
  increment: 0.25,
};

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    type: "boolean",
    createdOn: localDate("2026-10-01"),
    archivedOn: null,
    ...overrides,
  };
}

function version(
  habitId: string,
  effectiveFrom: string,
  config: Partial<HabitConfig> = {},
): HabitVersion {
  return {
    ...booleanConfig,
    ...config,
    id: `${habitId}@${effectiveFrom}`,
    habitId,
    effectiveFrom: localDate(effectiveFrom),
  };
}

function entry(habitId: string, date: string, value: number): Entry {
  return {
    id: `${habitId}#${date}`,
    habitId,
    date: localDate(date),
    value,
  };
}

function idsFor(
  data: Parameters<typeof habitsForDay>[0],
  date: Parameters<typeof habitsForDay>[1],
) {
  return habitsForDay(data, date).map((dayHabit) => dayHabit.habit.id);
}

describe("isDone", () => {
  const booleanVersion = version("meditate", "2026-10-01");
  const waterVersion = version("water", "2026-10-01", waterConfig);

  test("a boolean habit is done when it is marked", () => {
    expect(isDone("boolean", booleanVersion, 0)).toBe(false);
    expect(isDone("boolean", booleanVersion, 1)).toBe(true);
  });

  test("a quantitative habit is done when it reaches the target (RF-16)", () => {
    expect(isDone("quantitative", waterVersion, 0)).toBe(false);
    expect(isDone("quantitative", waterVersion, 1.75)).toBe(false);
    expect(isDone("quantitative", waterVersion, 2)).toBe(true);
    expect(isDone("quantitative", waterVersion, 2.5)).toBe(true);
  });

  test("a quantitative habit with no target is never done", () => {
    expect(isDone("quantitative", booleanVersion, 100)).toBe(false);
  });
});

describe("habitsForDay", () => {
  test("lists the habits due that day with their state (RF-12, RF-13)", () => {
    const meditate = habit("meditate");
    const water = habit("water", { type: "quantitative" });
    const meditateVersion = version("meditate", "2026-10-01");
    const waterVersion = version("water", "2026-10-01", waterConfig);

    const data = {
      habits: [meditate, water],
      versions: [meditateVersion, waterVersion],
      entries: [
        entry("meditate", "2026-10-28", 1),
        entry("water", "2026-10-28", 1.25),
        // Entries of other days do not count.
        entry("water", "2026-10-27", 2),
      ],
    };

    expect(habitsForDay(data, wednesday)).toEqual([
      { habit: meditate, version: meditateVersion, value: 1, done: true },
      { habit: water, version: waterVersion, value: 1.25, done: false },
    ]);
  });

  test("a habit with no entry is pending with a value of 0", () => {
    const data = {
      habits: [habit("meditate")],
      versions: [version("meditate", "2026-10-01")],
      entries: [],
    };
    expect(habitsForDay(data, wednesday)).toMatchObject([
      { value: 0, done: false },
    ]);
  });

  test("keeps the order of the habits it receives", () => {
    const data = {
      habits: [habit("c"), habit("a"), habit("b")],
      versions: [
        version("a", "2026-10-01"),
        version("b", "2026-10-01"),
        version("c", "2026-10-01"),
      ],
      entries: [],
    };
    expect(idsFor(data, wednesday)).toEqual(["c", "a", "b"]);
  });

  test("only shows a habit on its scheduled days", () => {
    const data = {
      habits: [habit("gym")],
      versions: [
        version("gym", "2026-10-01", {
          scheduledDays: scheduledDaysFrom([0, 2]),
        }),
      ],
      entries: [],
    };
    expect(idsFor(data, monday)).toEqual(["gym"]);
    expect(idsFor(data, tuesday)).toEqual([]);
    expect(idsFor(data, wednesday)).toEqual(["gym"]);
  });

  test("a habit never appears before the day it was created (RF-17)", () => {
    const data = {
      habits: [habit("meditate", { createdOn: tuesday })],
      versions: [version("meditate", "2026-10-27")],
      entries: [],
    };
    expect(idsFor(data, monday)).toEqual([]);
    expect(idsFor(data, tuesday)).toEqual(["meditate"]);
    expect(idsFor(data, wednesday)).toEqual(["meditate"]);
  });

  test("future days show the habits that will be due (RF-20)", () => {
    const data = {
      habits: [habit("meditate")],
      versions: [version("meditate", "2026-10-01")],
      entries: [],
    };
    expect(idsFor(data, localDate("2027-03-15"))).toEqual(["meditate"]);
  });

  describe("configuration changes (RF-09)", () => {
    const water = habit("water", { type: "quantitative" });
    const data = {
      habits: [water],
      versions: [
        version("water", "2026-10-01", waterConfig),
        // From Tuesday: a higher target, and no longer due on Wednesdays.
        version("water", "2026-10-27", {
          ...waterConfig,
          target: 3,
          scheduledDays: scheduledDaysFrom([0, 1]),
        }),
      ],
      entries: [
        entry("water", "2026-10-26", 2),
        entry("water", "2026-10-27", 2),
      ],
    };

    test("past days keep the target they had then", () => {
      expect(habitsForDay(data, monday)).toMatchObject([
        { value: 2, done: true, version: { target: 2 } },
      ]);
    });

    test("the new target applies from the day of the change", () => {
      expect(habitsForDay(data, tuesday)).toMatchObject([
        { value: 2, done: false, version: { target: 3 } },
      ]);
    });

    test("the new scheduled days apply from the day of the change", () => {
      expect(idsFor(data, wednesday)).toEqual([]);
      // The previous Wednesday was still under the first version.
      expect(idsFor(data, localDate("2026-10-21"))).toEqual(["water"]);
    });
  });

  describe("archived habits (RF-10)", () => {
    const archived = habit("meditate", { archivedOn: tuesday });
    const versions = [version("meditate", "2026-10-01")];

    test("still appears on the days before it was archived", () => {
      const data = { habits: [archived], versions, entries: [] };
      expect(idsFor(data, monday)).toEqual(["meditate"]);
    });

    test("does not appear after the day it was archived, even with an entry", () => {
      const entries = [entry("meditate", "2026-10-28", 1)];
      const data = { habits: [archived], versions, entries };
      expect(idsFor(data, wednesday)).toEqual([]);
    });

    test("does not appear on the day it was archived if nothing was recorded", () => {
      const data = { habits: [archived], versions, entries: [] };
      expect(idsFor(data, tuesday)).toEqual([]);
    });

    test("an entry of 0 on the day it was archived counts as nothing recorded", () => {
      const entries = [entry("meditate", "2026-10-27", 0)];
      const data = { habits: [archived], versions, entries };
      expect(idsFor(data, tuesday)).toEqual([]);
    });

    test("appears on the day it was archived if something was recorded", () => {
      const entries = [entry("meditate", "2026-10-27", 1)];
      const data = { habits: [archived], versions, entries };
      expect(habitsForDay(data, tuesday)).toMatchObject([
        { value: 1, done: true },
      ]);
    });
  });

  test("skips a habit that has no version in force that day", () => {
    const data = {
      habits: [habit("meditate"), habit("orphan")],
      versions: [
        version("meditate", "2026-10-01"),
        // Its only version starts after the day being viewed.
        version("orphan", "2026-11-15"),
      ],
      entries: [],
    };
    expect(idsFor(data, wednesday)).toEqual(["meditate"]);
  });

  test("skips a habit with no versions at all", () => {
    const data = { habits: [habit("meditate")], versions: [], entries: [] };
    expect(idsFor(data, wednesday)).toEqual([]);
  });
});
