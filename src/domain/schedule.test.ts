import {
  EVERY_DAY,
  NO_DAYS,
  isScheduledOn,
  isValidScheduledDays,
  scheduledDaysFrom,
  weekdaysIn,
} from "./schedule";

describe("scheduledDaysFrom", () => {
  test("Monday is bit 0 and Sunday is bit 6", () => {
    expect(scheduledDaysFrom([0])).toBe(0b0000001);
    expect(scheduledDaysFrom([6])).toBe(0b1000000);
  });

  test("combines several days, ignoring order and repeats", () => {
    expect(scheduledDaysFrom([4, 0, 2, 0])).toBe(0b0010101);
  });

  test("no days gives the empty mask and all days the full one", () => {
    expect(scheduledDaysFrom([])).toBe(NO_DAYS);
    expect(scheduledDaysFrom([0, 1, 2, 3, 4, 5, 6])).toBe(EVERY_DAY);
  });
});

describe("weekdaysIn", () => {
  test("lists the days from Monday to Sunday", () => {
    expect(weekdaysIn(0b0010101)).toEqual([0, 2, 4]);
    expect(weekdaysIn(NO_DAYS)).toEqual([]);
    expect(weekdaysIn(EVERY_DAY)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("is the inverse of scheduledDaysFrom", () => {
    expect(weekdaysIn(scheduledDaysFrom([1, 5, 6]))).toEqual([1, 5, 6]);
  });
});

describe("isScheduledOn", () => {
  test("checks a single weekday", () => {
    const weekdaysOnly = scheduledDaysFrom([0, 1, 2, 3, 4]);
    expect(isScheduledOn(weekdaysOnly, 0)).toBe(true);
    expect(isScheduledOn(weekdaysOnly, 4)).toBe(true);
    expect(isScheduledOn(weekdaysOnly, 5)).toBe(false);
    expect(isScheduledOn(weekdaysOnly, 6)).toBe(false);
  });
});

describe("isValidScheduledDays", () => {
  test("accepts every mask from no days to every day", () => {
    expect(isValidScheduledDays(NO_DAYS)).toBe(true);
    expect(isValidScheduledDays(0b0010101)).toBe(true);
    expect(isValidScheduledDays(EVERY_DAY)).toBe(true);
  });

  test.each([
    ["a bit beyond Sunday", 0b10000000],
    ["a negative number", -1],
    ["a decimal number", 1.5],
    ["NaN", Number.NaN],
  ])("rejects %s", (_case, value) => {
    expect(isValidScheduledDays(value)).toBe(false);
  });
});
