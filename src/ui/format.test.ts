import { localDate } from "@/domain/dates";
import { EVERY_DAY } from "@/domain/schedule";

import { formatAmount, formatDayTitle, formatProgress } from "./format";

const today = localDate("2026-11-12");

test("formatDayTitle says Hoy for the current day (RF-30)", () => {
  expect(formatDayTitle(today, today)).toBe("Hoy");
});

test("formatDayTitle says the weekday and the short date for other days", () => {
  expect(formatDayTitle(localDate("2026-11-10"), today)).toBe("Martes, 10 nov");
  expect(formatDayTitle(localDate("2027-01-03"), today)).toBe("Domingo, 3 ene");
  expect(formatDayTitle(localDate("2026-09-02"), today)).toBe(
    "Miércoles, 2 sept",
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
