import { localDate } from "./dates";
import type { DayHabit } from "./day";
import { keepGroups, keepOrder, sortByReminders, sortDayHabits } from "./order";
import type { Reminder } from "./reminders";
import { EVERY_DAY } from "./schedule";
import { localTime } from "./times";

function reminder(habitId: string, time: string): Reminder {
  return { id: `${habitId}-${time}`, habitId, time: localTime(time) };
}

const byId = (id: string) => id;

describe("sortByReminders without the current time (another day)", () => {
  test("sorts the habits by the time of their earliest reminder (RF-12)", () => {
    const reminders = [
      reminder("read", "22:00"),
      reminder("water", "12:00"),
      reminder("read", "07:30"),
      reminder("walk", "09:00"),
      reminder("walk", "23:00"),
    ];

    expect(
      sortByReminders(["walk", "water", "read"], byId, reminders, null),
    ).toEqual(["read", "walk", "water"]);
  });

  test("puts the habits without reminders last, even after 23:59", () => {
    const reminders = [reminder("late", "23:59")];

    expect(sortByReminders(["none", "late"], byId, reminders, null)).toEqual([
      "late",
      "none",
    ]);
  });

  test("keeps the given order on ties, with and without reminders", () => {
    const reminders = [reminder("b", "08:00"), reminder("a", "08:00")];

    expect(
      sortByReminders(["x", "a", "y", "b"], byId, reminders, null),
    ).toEqual(["a", "b", "x", "y"]);
  });

  test("does not change the given list", () => {
    const items = ["b", "a"];
    sortByReminders(items, byId, [reminder("a", "08:00")], null);

    expect(items).toEqual(["b", "a"]);
  });

  test("works with any item through the habit id", () => {
    const items = [{ habitId: "b" }, { habitId: "a" }];

    expect(
      sortByReminders(
        items,
        (item) => item.habitId,
        [reminder("a", "08:00")],
        null,
      ),
    ).toEqual([{ habitId: "a" }, { habitId: "b" }]);
  });
});

describe("sortByReminders at the current time (today)", () => {
  // The example of the discussion: at 10:30, nothing done yet.
  const reminders = [
    reminder("meditate", "07:00"),
    reminder("water", "09:00"),
    reminder("water", "13:00"),
    reminder("water", "18:00"),
    reminder("read", "11:00"),
    reminder("walk", "17:00"),
  ];
  const habits = ["meditate", "water", "read", "walk", "stretch"];

  test("puts the overdue habits first, then the others by their next reminder (RF-12)", () => {
    expect(
      sortByReminders(habits, byId, reminders, localTime("10:30")),
    ).toEqual(["meditate", "read", "water", "walk", "stretch"]);
  });

  test("a habit with several reminders moves on to the next one when one goes off", () => {
    expect(
      sortByReminders(habits, byId, reminders, localTime("13:30")),
    ).toEqual(["meditate", "read", "walk", "water", "stretch"]);
  });

  test("a habit is overdue only when all its reminders have gone off", () => {
    expect(
      sortByReminders(habits, byId, reminders, localTime("18:30")),
    ).toEqual(["meditate", "read", "walk", "water", "stretch"]);
  });

  test("sorts the overdue habits by their last reminder", () => {
    const late = [
      reminder("a", "07:00"),
      reminder("a", "15:00"),
      reminder("b", "12:00"),
    ];

    expect(sortByReminders(["a", "b"], byId, late, localTime("20:00"))).toEqual(
      ["b", "a"],
    );
  });

  test("a reminder at the current time has already gone off", () => {
    const at = [reminder("now", "10:30"), reminder("later", "10:31")];

    expect(
      sortByReminders(["later", "now"], byId, at, localTime("10:30")),
    ).toEqual(["now", "later"]);
  });

  test("before every reminder it is like another day", () => {
    expect(
      sortByReminders(habits, byId, reminders, localTime("06:00")),
    ).toEqual(sortByReminders(habits, byId, reminders, null));
  });
});

function dayHabit(id: string, done: boolean): DayHabit {
  return {
    habit: {
      id,
      name: id,
      type: "boolean",
      color: null,
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

    expect(groupIds(sortDayHabits(dayHabits, [], null))).toEqual({
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

    expect(groupIds(sortDayHabits(dayHabits, reminders, null))).toEqual({
      pending: ["early", "late", "none"],
      done: ["done-early", "done-late", "done-none"],
    });
  });

  test("on the current day, each group puts the overdue habits first (RF-12)", () => {
    const dayHabits = [
      dayHabit("next", false),
      dayHabit("overdue", false),
      dayHabit("done-next", true),
      dayHabit("done-overdue", true),
    ];
    const reminders = [
      reminder("next", "12:00"),
      reminder("overdue", "08:00"),
      reminder("done-next", "12:00"),
      reminder("done-overdue", "08:00"),
    ];

    expect(
      groupIds(sortDayHabits(dayHabits, reminders, localTime("10:00"))),
    ).toEqual({
      pending: ["overdue", "next"],
      done: ["done-overdue", "done-next"],
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
