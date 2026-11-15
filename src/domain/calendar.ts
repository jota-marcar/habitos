// The months of the calendar that changes the day on screen (RF-18).

import { addDays, localDate, weekdayOf, type LocalDate } from "./dates";

/** A month of a year. `month` goes from 1 (January) to 12 (December). */
export interface Month {
  readonly year: number;
  readonly month: number;
}

const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

export function monthOf(date: LocalDate): Month {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

/**
 * The position of a month in the sequence of all months, to move between them: the next
 * month is always one more, also from December to January.
 */
export function monthIndex(month: Month): number {
  return month.year * MONTHS_PER_YEAR + (month.month - 1);
}

/** The month at a position given by `monthIndex`. */
export function monthAt(index: number): Month {
  const year = Math.floor(index / MONTHS_PER_YEAR);
  return { year, month: index - year * MONTHS_PER_YEAR + 1 };
}

/**
 * The days of a month in weeks that start on Monday. Every week has 7 cells: a date, or null
 * for the cells before the first day and after the last one.
 */
export function monthWeeks({ year, month }: Month): (LocalDate | null)[][] {
  const pad = (n: number, length: number) => String(n).padStart(length, "0");
  const first = localDate(`${pad(year, 4)}-${pad(month, 2)}-01`);
  // Day 0 of the next month is the last day of this one.
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (LocalDate | null)[] = new Array(weekdayOf(first)).fill(null);
  for (let day = 0; day < days; day++) cells.push(addDays(first, day));
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);

  const weeks: (LocalDate | null)[][] = [];
  for (let start = 0; start < cells.length; start += DAYS_PER_WEEK) {
    weeks.push(cells.slice(start, start + DAYS_PER_WEEK));
  }
  return weeks;
}
