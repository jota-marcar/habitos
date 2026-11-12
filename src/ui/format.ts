// How the interface writes amounts, days and times for the user, in Spanish.

import { weekdayOf, type LocalDate, type Weekday } from "@/domain/dates";
import type { HabitConfig } from "@/domain/habits";
import { EVERY_DAY, weekdaysIn } from "@/domain/schedule";
import type { LocalTime } from "@/domain/times";

/** Initials of the weekdays, from Monday to Sunday. */
export const WEEKDAY_INITIALS: Readonly<Record<Weekday, string>> = {
  0: "L",
  1: "M",
  2: "X",
  3: "J",
  4: "V",
  5: "S",
  6: "D",
};

export const WEEKDAY_NAMES: Readonly<Record<Weekday, string>> = {
  0: "lunes",
  1: "martes",
  2: "miércoles",
  3: "jueves",
  4: "viernes",
  5: "sábado",
  6: "domingo",
};

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** A date as it is said: "jueves, 12 de noviembre". */
export function formatLongDate(date: LocalDate): string {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${day} de ${MONTH_NAMES[month - 1]}`;
}

/** An amount with a decimal comma and no trailing zeros: 1.5 → "1,5". */
export function formatAmount(value: number): string {
  return String(value).replace(".", ",");
}

/** "Todos los días", or the initials of the scheduled days: "L, X, V". */
export function formatScheduledDays(scheduledDays: number): string {
  if (scheduledDays === EVERY_DAY) return "Todos los días";
  return weekdaysIn(scheduledDays)
    .map((weekday) => WEEKDAY_INITIALS[weekday])
    .join(", ");
}

/** The target of a quantitative habit and its increment: "Meta 2 L · +0,25". */
export function formatTarget(config: HabitConfig): string | null {
  if (config.target === null || config.increment === null) return null;
  return `Meta ${formatAmount(config.target)} ${config.unit ?? ""} · +${formatAmount(config.increment)}`;
}

/** The reminder times in order: "08:00 · 21:30". */
export function formatReminderTimes(times: readonly LocalTime[]): string {
  return [...times].sort().join(" · ");
}
