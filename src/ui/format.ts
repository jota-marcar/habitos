// How the interface writes dates and amounts for the user, in Spanish.

import { weekdayOf, type LocalDate, type Weekday } from "@/domain/dates";
import type { HabitConfig } from "@/domain/habits";

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

const MONTH_ABBREVIATIONS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
] as const;

/** The title of the day view (RF-30): "Hoy", or the weekday and the date: "Martes, 10 nov". */
export function formatDayTitle(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Hoy";
  const [, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[weekdayOf(date)];
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${MONTH_ABBREVIATIONS[month - 1]}`;
}

/** An amount with a decimal comma and no trailing zeros: 1.5 → "1,5". */
export function formatAmount(value: number): string {
  return String(value).replace(".", ",");
}

/** How a quantitative habit is going (RF-13): "1,25 / 2 L". */
export function formatProgress(value: number, config: HabitConfig): string {
  const target = formatAmount(config.target ?? 0);
  return `${formatAmount(value)} / ${target} ${config.unit ?? ""}`.trim();
}
