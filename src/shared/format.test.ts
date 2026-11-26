import { localDate } from "@/domain/dates";
import { EVERY_DAY } from "@/domain/schedule";
import { weekOf } from "@/domain/weeks";

import {
  formatAmount,
  formatDaysLeft,
  formatDaysLeftLine,
  formatDayTitle,
  formatFullDate,
  formatMonthTitle,
  formatPace,
  formatProgress,
  formatWeekRange,
} from "./format";

const today = localDate("2026-11-12");

test("formatDayTitle says Hoy for the current day (RF-30)", () => {
  expect(formatDayTitle(today, today)).toBe("Hoy");
});

test("formatDayTitle says the weekday and the short date for other days", () => {
  expect(formatDayTitle(localDate("2026-11-10"), today)).toBe("Martes, 10 nov");
  expect(formatDayTitle(localDate("2026-09-02"), today)).toBe(
    "Miércoles, 2 sept",
  );
});

test("formatDayTitle adds the year to a day of another year", () => {
  expect(formatDayTitle(localDate("2027-01-03"), today)).toBe(
    "Domingo, 3 ene 2027",
  );
  expect(formatDayTitle(localDate("2025-12-31"), today)).toBe(
    "Miércoles, 31 dic 2025",
  );
});

test.each([
  ["2026-11-16", "16–22 nov"],
  ["2026-11-30", "30 nov – 6 dic"],
  ["2027-01-04", "4–10 ene 2027"],
  ["2027-01-25", "25–31 ene 2027"],
  ["2027-03-29", "29 mar – 4 abr 2027"],
  ["2026-12-28", "28 dic 2026 – 3 ene 2027"],
])("formatWeekRange writes the week of %s as %s (RF-40)", (date, text) => {
  expect(formatWeekRange(weekOf(localDate(date)), today)).toBe(text);
});

test("formatMonthTitle says the month and the year (RF-18)", () => {
  expect(formatMonthTitle({ year: 2026, month: 11 })).toBe("Noviembre 2026");
  expect(formatMonthTitle({ year: 2027, month: 1 })).toBe("Enero 2027");
});

test("formatFullDate writes a date in full", () => {
  expect(formatFullDate(localDate("2026-11-02"))).toBe(
    "2 de noviembre de 2026",
  );
});

test("formatAmount uses a decimal comma", () => {
  expect(formatAmount(2)).toBe("2");
  expect(formatAmount(0.25)).toBe("0,25");
  expect(formatAmount(1.5)).toBe("1,5");
});

test("formatProgress shows the amount, the target and the unit (RF-13)", () => {
  const config = {
    scheduledDays: EVERY_DAY,
    target: 2,
    unit: "L",
    increment: 0.25,
  };
  expect(formatProgress(1.25, config)).toBe("1,25 / 2 L");
  expect(formatProgress(0, config)).toBe("0 / 2 L");
});

test("formatDaysLeft says what is left of a long-term goal (RF-58)", () => {
  expect(formatDaysLeft(40)).toBe("quedan 40 días");
  expect(formatDaysLeft(1)).toBe("queda 1 día");
  expect(formatDaysLeft(0)).toBe("último día");
});

test("formatPace says how a long-term goal is going against its pace (RF-62)", () => {
  expect(formatPace({ kind: "on_pace" }, "libros")).toBe("al día");
  expect(formatPace({ kind: "behind", amount: 2 }, "libros")).toBe(
    "2 libros por detrás",
  );
  expect(formatPace({ kind: "ahead", amount: 1.5 }, "km")).toBe(
    "1,5 km por delante",
  );
  expect(formatPace({ kind: "behind", amount: 3 }, null)).toBe("3 por detrás");
});

test("formatDaysLeftLine starts a line with it (RF-55)", () => {
  expect(formatDaysLeftLine(217)).toBe("Quedan 217 días");
  expect(formatDaysLeftLine(0)).toBe("Último día");
});
