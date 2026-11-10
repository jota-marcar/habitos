import {
  addDays,
  localDate,
  localDateOf,
  parseLocalDate,
  weekdayOf,
} from "./dates";

describe("parseLocalDate", () => {
  test("accepts a real date in YYYY-MM-DD format", () => {
    expect(parseLocalDate("2026-10-28")).toBe("2026-10-28");
  });

  test("accepts February 29 in a leap year", () => {
    expect(parseLocalDate("2028-02-29")).toBe("2028-02-29");
  });

  test.each([
    ["another format", "28/10/2026"],
    ["missing zero padding", "2026-1-5"],
    ["a time attached", "2026-10-28T10:00:00"],
    ["an empty string", ""],
    ["month 13", "2026-13-01"],
    ["month 0", "2026-00-10"],
    ["day 0", "2026-10-00"],
    ["February 30", "2026-02-30"],
    ["February 29 in a non-leap year", "2026-02-29"],
  ])("rejects %s", (_case, text) => {
    expect(parseLocalDate(text)).toBeNull();
  });
});

describe("localDate", () => {
  test("returns a valid date", () => {
    expect(localDate("2026-10-28")).toBe("2026-10-28");
  });

  test("throws on an invalid date", () => {
    expect(() => localDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("localDateOf", () => {
  test("uses the local calendar day of the instant", () => {
    expect(localDateOf(new Date(2026, 9, 28, 23, 59))).toBe("2026-10-28");
    expect(localDateOf(new Date(2026, 9, 29, 0, 0))).toBe("2026-10-29");
  });

  test("pads the month and the day", () => {
    expect(localDateOf(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });
});

describe("weekdayOf", () => {
  test.each([
    ["2026-10-26", 0],
    ["2026-10-27", 1],
    ["2026-10-28", 2],
    ["2026-10-29", 3],
    ["2026-10-30", 4],
    ["2026-10-31", 5],
    ["2026-11-01", 6],
  ])("%s is weekday %i (Monday = 0)", (date, weekday) => {
    expect(weekdayOf(localDate(date))).toBe(weekday);
  });
});

describe("addDays", () => {
  test("moves forward and backward", () => {
    expect(addDays(localDate("2026-10-28"), 1)).toBe("2026-10-29");
    expect(addDays(localDate("2026-10-28"), -1)).toBe("2026-10-27");
    expect(addDays(localDate("2026-10-28"), 0)).toBe("2026-10-28");
  });

  test("crosses month and year boundaries", () => {
    expect(addDays(localDate("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(localDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(localDate("2027-01-01"), -1)).toBe("2026-12-31");
  });

  test("handles leap years", () => {
    expect(addDays(localDate("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(localDate("2026-02-28"), 1)).toBe("2026-03-01");
  });

  test("is not affected by daylight saving time changes", () => {
    // Clocks go back in Spain on 2026-10-25 and forward on 2027-03-28.
    expect(addDays(localDate("2026-10-24"), 2)).toBe("2026-10-26");
    expect(addDays(localDate("2027-03-27"), 2)).toBe("2027-03-29");
  });

  test("dates compare correctly as strings", () => {
    expect(localDate("2026-09-30") < localDate("2026-10-01")).toBe(true);
    expect(localDate("2026-12-31") < localDate("2027-01-01")).toBe(true);
  });
});
