import { sortByFirstReminder } from "./order";
import type { Reminder } from "./reminders";
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
