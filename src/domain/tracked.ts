// What habits, weekly goals and long-term goals have in common: their type, their color, their
// name and the amounts of the quantitative ones, with the rules that check them.

import { MAX_AMOUNT, isAmount } from "./amounts";

export type TrackedType = "boolean" | "quantitative";

/**
 * The colors a habit, weekly goal or long-term goal can be given to tell it apart from others
 * (RF-06). They are the keys of a palette: the interface decides the tone of each one
 * (ADR-0014).
 */
export const TRACKED_COLORS = [
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "violet",
  "fuchsia",
  "pink",
  "gray",
] as const;

export type TrackedColor = (typeof TRACKED_COLORS)[number];

/**
 * The color with the key `text`, or null if there is none: a habit without a color, or a key
 * of a palette this version does not know (ADR-0014).
 */
export function parseTrackedColor(text: string | null): TrackedColor | null {
  return TRACKED_COLORS.find((color) => color === text) ?? null;
}

/** The amounts of a quantitative habit, weekly goal or long-term goal: null in boolean ones. */
export interface Amounts {
  readonly target: number | null;
  readonly unit: string | null;
  readonly increment: number | null;
}

export type NameError = "name_empty" | "name_too_long";

export type AmountsError =
  | "amounts_not_allowed"
  | "target_not_positive"
  | "target_too_precise"
  | "target_too_large"
  | "unit_empty"
  | "unit_too_long"
  | "increment_not_positive"
  | "increment_too_precise"
  | "increment_too_large";

export const DEFAULT_INCREMENT = 1;

/** Longest name and unit, in characters, without surrounding spaces (RF-06). */
export const MAX_NAME_LENGTH = 40;
export const MAX_UNIT_LENGTH = 10;

// Counts characters as the user sees them, so that an emoji counts as one.
function lengthOf(text: string): number {
  return [...text.trim()].length;
}

/** `text` cut to `maxLength`, counted as the rules count it, so that it can be typed. */
export function limitedText(text: string, maxLength: number): string {
  if (lengthOf(text) <= maxLength) return text;
  const start = text.length - text.trimStart().length;
  const kept = [...text.slice(start)].slice(0, maxLength).join("");
  return text.slice(0, start) + kept;
}

export function validateName(name: string): NameError[] {
  if (name.trim() === "") return ["name_empty"];
  return lengthOf(name) > MAX_NAME_LENGTH ? ["name_too_long"] : [];
}

function validateAmount(
  value: number | null,
  notPositive: AmountsError,
  tooPrecise: AmountsError,
  tooLarge: AmountsError,
): AmountsError[] {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return [notPositive];
  }
  if (value > MAX_AMOUNT) return [tooLarge];
  return isAmount(value) ? [] : [tooPrecise];
}

/** Boolean ones have no amounts; quantitative ones need all of them. */
export function validateAmounts(
  type: TrackedType,
  amounts: Amounts,
): AmountsError[] {
  if (type === "boolean") {
    const hasAmounts =
      amounts.target !== null ||
      amounts.unit !== null ||
      amounts.increment !== null;
    return hasAmounts ? ["amounts_not_allowed"] : [];
  }

  const errors = validateAmount(
    amounts.target,
    "target_not_positive",
    "target_too_precise",
    "target_too_large",
  );
  if (amounts.unit === null || amounts.unit.trim() === "") {
    errors.push("unit_empty");
  } else if (lengthOf(amounts.unit) > MAX_UNIT_LENGTH) {
    errors.push("unit_too_long");
  }
  errors.push(
    ...validateAmount(
      amounts.increment,
      "increment_not_positive",
      "increment_too_precise",
      "increment_too_large",
    ),
  );
  return errors;
}

/** The amounts as they are stored: the unit, without surrounding spaces. */
export function normalizeAmounts(amounts: Amounts): Amounts {
  return {
    target: amounts.target,
    unit: amounts.unit === null ? null : amounts.unit.trim(),
    increment: amounts.increment,
  };
}
