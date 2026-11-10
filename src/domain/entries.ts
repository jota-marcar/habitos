// Entries: what has been recorded for a habit on a given day.
// The value is 1 or 0 in boolean habits and the accumulated amount in quantitative ones.
// It is never negative, and a value of 0 is the same as having no entry: the habit is pending.

import { isAmount, roundAmount } from "./amounts";
import type { LocalDate } from "./dates";
import { fail, ok, type Result } from "./result";

export interface Entry {
  readonly id: string;
  readonly habitId: string;
  readonly date: LocalDate;
  readonly value: number;
}

export type AmountError =
  "amount_invalid" | "amount_negative" | "amount_too_precise";

/** Past days and today can be recorded; future days can only be viewed (RF-19, RF-20). */
export function canRecordOn(date: LocalDate, today: LocalDate): boolean {
  return date <= today;
}

/** Marks or unmarks a boolean habit (RF-14). */
export function toggled(value: number): number {
  return value >= 1 ? 0 : 1;
}

/** Adds the increment to a quantitative habit (RF-15). The target can be exceeded (RF-16). */
export function incremented(value: number, increment: number): number {
  return roundAmount(value + increment);
}

/** Subtracts the increment from a quantitative habit, without going below 0 (RF-15). */
export function decremented(value: number, increment: number): number {
  return Math.max(0, roundAmount(value - increment));
}

/** Checks an exact amount typed by the user for a quantitative habit (RF-15). */
export function exactAmount(value: number): Result<number, AmountError> {
  if (!Number.isFinite(value)) return fail(["amount_invalid"]);
  if (value < 0) return fail(["amount_negative"]);
  if (!isAmount(value)) return fail(["amount_too_precise"]);
  return ok(value);
}
