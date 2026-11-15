import { monthAt, monthIndex, monthOf, monthWeeks } from "./calendar";
import { localDate } from "./dates";

describe("monthOf", () => {
  test("gives the month a date belongs to", () => {
    expect(monthOf(localDate("2026-11-12"))).toEqual({ year: 2026, month: 11 });
    expect(monthOf(localDate("2027-01-01"))).toEqual({ year: 2027, month: 1 });
  });
});

describe("monthIndex and monthAt", () => {
  test("consecutive months are one apart, also across years", () => {
    const december = monthIndex({ year: 2026, month: 12 });

    expect(monthIndex({ year: 2026, month: 11 })).toBe(december - 1);
    expect(monthIndex({ year: 2027, month: 1 })).toBe(december + 1);
  });

  test("monthAt undoes monthIndex", () => {
    for (const month of [
      { year: 2026, month: 1 },
      { year: 2026, month: 12 },
      { year: 2027, month: 6 },
    ]) {
      expect(monthAt(monthIndex(month))).toEqual(month);
    }
  });

  test("moves back and forth across a year boundary", () => {
    const january = monthIndex({ year: 2027, month: 1 });

    expect(monthAt(january - 1)).toEqual({ year: 2026, month: 12 });
    expect(monthAt(january + 12)).toEqual({ year: 2028, month: 1 });
  });
});

describe("monthWeeks (RF-18)", () => {
  /** The day numbers of each week, with "·" in the empty cells. */
  function numbers(year: number, month: number): string[] {
    return monthWeeks({ year, month }).map((week) =>
      week
        .map((date) => (date ? String(Number(date.slice(8))) : "·"))
        .join(" "),
    );
  }

  test("weeks start on Monday and blank cells pad the first and last ones", () => {
    // November 2026 starts on a Sunday.
    expect(numbers(2026, 11)).toEqual([
      "· · · · · · 1",
      "2 3 4 5 6 7 8",
      "9 10 11 12 13 14 15",
      "16 17 18 19 20 21 22",
      "23 24 25 26 27 28 29",
      "30 · · · · · ·",
    ]);
  });

  test("a month that starts on a Monday has no blanks before it", () => {
    expect(numbers(2026, 6)[0]).toBe("1 2 3 4 5 6 7");
  });

  test("a February of four whole weeks has no blanks at all", () => {
    expect(numbers(2027, 2)).toEqual([
      "1 2 3 4 5 6 7",
      "8 9 10 11 12 13 14",
      "15 16 17 18 19 20 21",
      "22 23 24 25 26 27 28",
    ]);
  });

  test("February has 29 days in a leap year", () => {
    expect(numbers(2028, 2).at(-1)).toBe("28 29 · · · · ·");
  });

  test("the cells are the dates of the month", () => {
    const weeks = monthWeeks({ year: 2026, month: 12 });

    expect(weeks[0][1]).toBe("2026-12-01");
    expect(weeks.at(-1)?.[3]).toBe("2026-12-31");
  });
});
