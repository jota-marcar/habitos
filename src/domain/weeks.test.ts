import { localDate } from "./dates";
import { isInWeek, weekOf } from "./weeks";

describe("weekOf", () => {
  test.each([
    ["2026-11-16", "a Monday"],
    ["2026-11-19", "a Thursday"],
    ["2026-11-22", "a Sunday"],
  ])("goes from Monday to Sunday for %s, %s", (date) => {
    expect(weekOf(localDate(date))).toEqual({
      start: localDate("2026-11-16"),
      end: localDate("2026-11-22"),
    });
  });

  test("can span two months and two years", () => {
    expect(weekOf(localDate("2027-01-01"))).toEqual({
      start: localDate("2026-12-28"),
      end: localDate("2027-01-03"),
    });
  });
});

describe("isInWeek", () => {
  const week = weekOf(localDate("2026-11-18"));

  test.each(["2026-11-16", "2026-11-18", "2026-11-22"])(
    "includes %s",
    (date) => {
      expect(isInWeek(localDate(date), week)).toBe(true);
    },
  );

  test.each(["2026-11-15", "2026-11-23"])("excludes %s", (date) => {
    expect(isInWeek(localDate(date), week)).toBe(false);
  });
});
