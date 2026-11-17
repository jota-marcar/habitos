// How the interface writes dates and amounts for the user, in Spanish.

import type { Month } from "@/domain/calendar";
import { weekdayOf, type LocalDate, type Weekday } from "@/domain/dates";
import type { HabitColor, HabitConfig } from "@/domain/habits";

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

/** The names of the colors of a habit, as a screen reader says them (RF-06). */
export const HABIT_COLOR_NAMES: Readonly<Record<HabitColor, string>> = {
  red: "Rojo",
  orange: "Naranja",
  amber: "Ámbar",
  lime: "Lima",
  green: "Verde",
  teal: "Turquesa",
  cyan: "Cian",
  blue: "Azul",
  violet: "Violeta",
  fuchsia: "Fucsia",
  pink: "Rosa",
  gray: "Gris",
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

function capitalized(text: string): string {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

/**
 * The title of the day view (RF-30): "Hoy", or the weekday and the date: "Martes, 10 nov".
 * A day of another year says which: "Domingo, 3 ene 2027".
 */
export function formatDayTitle(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Hoy";
  const [year, month, day] = date.split("-").map(Number);
  const weekday = capitalized(WEEKDAY_NAMES[weekdayOf(date)]);
  const short = `${weekday}, ${day} ${MONTH_ABBREVIATIONS[month - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${year}`;
}

/** The title of a month of the calendar (RF-18): "Noviembre 2026". */
export function formatMonthTitle({ year, month }: Month): string {
  return `${capitalized(MONTH_NAMES[month - 1])} ${year}`;
}

/** A date in full, as a screen reader says a day of the calendar: "12 de noviembre de 2026". */
export function formatFullDate(date: LocalDate): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} de ${MONTH_NAMES[month - 1]} de ${year}`;
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
