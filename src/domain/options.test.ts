import { localDate } from "./dates";
import type { Habit } from "./habits";
import { habitOptions } from "./options";

const today = localDate("2026-11-12");
const yesterday = localDate("2026-11-11");
const tomorrow = localDate("2026-11-13");

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Beber agua",
    type: "quantitative",
    color: null,
    createdOn: localDate("2026-11-01"),
    archivedOn: null,
    ...overrides,
  };
}

describe("habitOptions (RF-34)", () => {
  test.each([
    ["today", today],
    ["a past day", yesterday],
  ])("a quantitative habit has every option on %s", (_case, date) => {
    expect(habitOptions(habit(), date, today)).toEqual([
      "decrement",
      "exact_amount",
      "edit",
      "archive",
      "delete",
    ]);
  });

  test("a boolean habit has no options to correct the amount", () => {
    expect(habitOptions(habit({ type: "boolean" }), today, today)).toEqual([
      "edit",
      "archive",
      "delete",
    ]);
  });

  test.each(["quantitative", "boolean"] as const)(
    "a %s habit cannot be recorded on a future day (RF-20)",
    (type) => {
      expect(habitOptions(habit({ type }), tomorrow, today)).toEqual([
        "edit",
        "archive",
        "delete",
      ]);
    },
  );

  test("an archived habit can still be corrected and deleted, but not edited or archived (RF-10)", () => {
    const archived = habit({ archivedOn: today });

    expect(habitOptions(archived, yesterday, today)).toEqual([
      "decrement",
      "exact_amount",
      "delete",
    ]);
    expect(
      habitOptions({ ...archived, type: "boolean" }, yesterday, today),
    ).toEqual(["delete"]);
  });
});
