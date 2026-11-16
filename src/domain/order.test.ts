import { localDate } from "./dates";
import type { DayHabit } from "./day";
import {
  keepGroups,
  keepOrder,
  sortByFirstReminder,
  sortDayHabits,
} from "./order";
import type { Reminder } from "./reminders";
import { EVERY_DAY } from "./schedule";
import { localTime } from "./times";

function reminder(habitId: string, time: string): Reminder {
  return { id: `${habitId}-${time}`, habitId, time: localTime(time) };
}

const byId = (id: string) => id;

describe("sortByFirstReminder", () => {
  test("sorts the habits by the time of their earliest reminder (RF-12)", () => {
    const reminders = [
      reminder("read", "22:00"),
      reminder("water", "12:00"),
      reminder("read", "07:30"),
      reminder("walk", "09:00"),
      reminder("walk", "23:00"),
    ];

    expect(
      sortByFirstReminder(["walk", "water", "read"], byId, reminders),
    ).toEqual(["read", "walk", "water"]);
  });

  test("puts the habits without reminders last, even after 23:59", () => {
    const reminders = [reminder("late", "23:59")];

    expect(sortByFirstReminder(["none", "late"], byId, reminders)).toEqual([
      "late",
      "none",
    ]);
  });

  test("keeps the given order on ties, with and without reminders", () => {
    const reminders = [reminder("b", "08:00"), reminder("a", "08:00")];

    expect(sortByFirstReminder(["x", "a", "y", "b"], byId, reminders)).toEqual([
      "a",
      "b",
      "x",
      "y",
    ]);
  });

  test("does not change the given list", () => {
    const items = ["b", "a"];
    sortByFirstReminder(items, byId, [reminder("a", "08:00")]);

    expect(items).toEqual(["b", "a"]);
  });

  test("works with any item through the habit id", () => {
    const items = [{ habitId: "b" }, { habitId: "a" }];

    expect(
      sortByFirstReminder(items, (item) => item.habitId, [
        reminder("a", "08:00"),
      ]),
    ).toEqual([{ habitId: "a" }, { habitId: "b" }]);
  });
});

function dayHabit(id: string, done: boolean): DayHabit {
  return {
    habit: {
      id,
      name: id,
      type: "boolean",
      createdOn: localDate("2026-11-01"),
      archivedOn: null,
    },
    version: {
      id: `${id}-v1`,
      habitId: id,
      effectiveFrom: localDate("2026-11-01"),
      scheduledDays: EVERY_DAY,
      target: null,
      unit: null,
      increment: null,
    },
    value: done ? 1 : 0,
    done,
  };
}

const ids = (dayHabits: readonly DayHabit[]) =>
  dayHabits.map((d) => d.habit.id);

const groupIds = (groups: {
  pending: readonly DayHabit[];
  done: readonly DayHabit[];
}) => ({ pending: ids(groups.pending), done: ids(groups.done) });

describe("sortDayHabits", () => {
  test("splits the pending habits from the done ones (RF-12)", () => {
    const dayHabits = [
      dayHabit("read", true),
      dayHabit("walk", false),
      dayHabit("water", true),
      dayHabit("meditate", false),
    ];

    expect(groupIds(sortDayHabits(dayHabits, []))).toEqual({
      pending: ["walk", "meditate"],
      done: ["read", "water"],
    });
  });

  test("sorts each group by the first reminder, without reminders last", () => {
    const dayHabits = [
      dayHabit("none", false),
      dayHabit("late", false),
      dayHabit("early", false),
      dayHabit("done-late", true),
      dayHabit("done-none", true),
      dayHabit("done-early", true),
    ];
    const reminders = [
      reminder("late", "21:00"),
      reminder("early", "07:00"),
      reminder("done-late", "22:00"),
      reminder("done-early", "06:00"),
    ];

    expect(groupIds(sortDayHabits(dayHabits, reminders))).toEqual({
      pending: ["early", "late", "none"],
      done: ["done-early", "done-late", "done-none"],
    });
  });
});

describe("keepOrder", () => {
  test("puts the items in the given order of habits (RF-12)", () => {
    expect(keepOrder(["a", "b", "c"], byId, ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("puts the habits that were not in the order at the end, as they come", () => {
    expect(keepOrder(["new2", "a", "new1", "b"], byId, ["b", "a"])).toEqual([
      "b",
      "a",
      "new2",
      "new1",
    ]);
  });

  test("ignores the habits of the order that are no longer there", () => {
    expect(keepOrder(["a"], byId, ["gone", "a"])).toEqual(["a"]);
  });

  test("does not change the given list", () => {
    const items = ["b", "a"];
    keepOrder(items, byId, ["a", "b"]);

    expect(items).toEqual(["b", "a"]);
  });
});

describe("keepGroups", () => {
  test("keeps each habit in its group and order, whatever it is now (RF-12)", () => {
    const groups = { pending: ["b", "a"], done: ["d", "c"] };

    expect(keepGroups(["a", "b", "c", "d"], byId, groups)).toEqual({
      pending: ["b", "a"],
      done: ["d", "c"],
    });
  });

  test("puts the new habits at the end of the pending ones", () => {
    const groups = { pending: ["a"], done: ["b"] };

    expect(keepGroups(["new", "b", "a"], byId, groups)).toEqual({
      pending: ["a", "new"],
      done: ["b"],
    });
  });

  test("leaves out the habits that are no longer there", () => {
    const groups = { pending: ["a", "gone"], done: ["also-gone"] };

    expect(keepGroups(["a"], byId, groups)).toEqual({
      pending: ["a"],
      done: [],
    });
  });
});
