import { localDate } from "./dates";
import {
  addMinutes,
  isBefore,
  localTime,
  localTimeOf,
  minutesOf,
  parseLocalTime,
  shiftMoment,
} from "./times";

const moment = (date: string, time: string) => ({
  date: localDate(date),
  time: localTime(time),
});

describe("isBefore", () => {
  test("compares the time within a day", () => {
    expect(
      isBefore(moment("2026-11-12", "09:00"), moment("2026-11-12", "10:00")),
    ).toBe(true);
    expect(
      isBefore(moment("2026-11-12", "10:00"), moment("2026-11-12", "10:00")),
    ).toBe(false);
  });

  test("the day comes before the time", () => {
    expect(
      isBefore(moment("2026-11-11", "23:00"), moment("2026-11-12", "01:00")),
    ).toBe(true);
    expect(
      isBefore(moment("2026-11-12", "01:00"), moment("2026-11-11", "23:00")),
    ).toBe(false);
  });
});

describe("shiftMoment", () => {
  test("moves within the day", () => {
    expect(shiftMoment(moment("2026-11-12", "20:00"), -120)).toEqual(
      moment("2026-11-12", "18:00"),
    );
  });

  test("crosses midnight in both directions", () => {
    expect(shiftMoment(moment("2026-11-13", "00:30"), -60)).toEqual(
      moment("2026-11-12", "23:30"),
    );
    expect(shiftMoment(moment("2026-11-30", "23:30"), 45)).toEqual(
      moment("2026-12-01", "00:15"),
    );
  });
});

describe("parseLocalTime", () => {
  test.each(["00:00", "08:30", "19:05", "23:59"])("accepts %s", (text) => {
    expect(parseLocalTime(text)).toBe(text);
  });

  test.each([
    ["an hour beyond 23", "24:00"],
    ["a minute beyond 59", "12:60"],
    ["a single-digit hour", "8:30"],
    ["seconds", "08:30:00"],
    ["a 12-hour time", "08:30 PM"],
    ["an empty text", ""],
    ["surrounding spaces", " 08:30"],
  ])("rejects %s", (_case, text) => {
    expect(parseLocalTime(text)).toBeNull();
  });
});

describe("localTime", () => {
  test("returns a valid time", () => {
    expect(localTime("08:30")).toBe("08:30");
  });

  test("throws on an invalid time", () => {
    expect(() => localTime("25:00")).toThrow(RangeError);
  });
});

describe("localTimeOf", () => {
  test("takes the local hour and minute and drops the seconds", () => {
    expect(localTimeOf(new Date(2026, 10, 11, 8, 5, 59))).toBe("08:05");
    expect(localTimeOf(new Date(2026, 10, 11, 0, 0, 0))).toBe("00:00");
    expect(localTimeOf(new Date(2026, 10, 11, 23, 59, 59))).toBe("23:59");
  });
});

describe("minutesOf", () => {
  test("counts the minutes since midnight", () => {
    expect(minutesOf(localTime("00:00"))).toBe(0);
    expect(minutesOf(localTime("08:30"))).toBe(510);
    expect(minutesOf(localTime("23:59"))).toBe(1439);
  });
});

describe("addMinutes", () => {
  test("moves forwards and backwards within the day", () => {
    expect(addMinutes(localTime("08:30"), 60)).toBe("09:30");
    expect(addMinutes(localTime("08:30"), 45)).toBe("09:15");
    expect(addMinutes(localTime("08:30"), -31)).toBe("07:59");
    expect(addMinutes(localTime("08:30"), 0)).toBe("08:30");
  });

  test("reaches the first and the last minute of the day", () => {
    expect(addMinutes(localTime("00:01"), -1)).toBe("00:00");
    expect(addMinutes(localTime("23:58"), 1)).toBe("23:59");
  });

  test("returns null when the result falls on another day", () => {
    expect(addMinutes(localTime("23:59"), 1)).toBeNull();
    expect(addMinutes(localTime("23:30"), 60)).toBeNull();
    expect(addMinutes(localTime("00:00"), -1)).toBeNull();
  });
});
