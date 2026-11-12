import { localDate } from "@/domain/dates";
import { EVERY_DAY, scheduledDaysFrom } from "@/domain/schedule";
import { localTime } from "@/domain/times";

import {
  formatAmount,
  formatLongDate,
  formatReminderTimes,
  formatScheduledDays,
  formatTarget,
} from "./format";

test("formatLongDate says the weekday, the day and the month", () => {
  expect(formatLongDate(localDate("2026-11-12"))).toBe(
    "jueves, 12 de noviembre",
  );
  expect(formatLongDate(localDate("2027-01-03"))).toBe("domingo, 3 de enero");
});

test("formatAmount uses a decimal comma", () => {
  expect(formatAmount(2)).toBe("2");
  expect(formatAmount(0.25)).toBe("0,25");
  expect(formatAmount(1.5)).toBe("1,5");
});

test("formatScheduledDays says every day or lists the initials", () => {
  expect(formatScheduledDays(EVERY_DAY)).toBe("Todos los días");
  expect(formatScheduledDays(scheduledDaysFrom([0, 2, 6]))).toBe("L, X, D");
});

test("formatTarget shows the target and the increment of a quantitative habit", () => {
  const config = {
    scheduledDays: EVERY_DAY,
    target: 2,
    unit: "L",
    increment: 0.25,
  };
  expect(formatTarget(config)).toBe("Meta 2 L · +0,25");
  expect(
    formatTarget({ ...config, target: null, unit: null, increment: null }),
  ).toBeNull();
});

test("formatReminderTimes lists the times in order", () => {
  expect(formatReminderTimes([localTime("21:30"), localTime("08:00")])).toBe(
    "08:00 · 21:30",
  );
});
