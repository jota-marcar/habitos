// Amounts of quantitative habits: targets, increments and recorded values.
// They have at most 2 decimals, so that adding increments such as 0.1 never accumulates
// floating-point error.

export const AMOUNT_DECIMALS = 2;

const FACTOR = 10 ** AMOUNT_DECIMALS;
// Tolerance for the error that multiplying by FACTOR introduces (0.07 * 100 = 7.000000000000001).
const TOLERANCE = 1e-9;

/** Rounds to the decimals an amount can have. */
export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * FACTOR) / FACTOR;
}

/** True if `value` is a finite number with no more decimals than an amount can have. */
export function isAmount(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = value * FACTOR;
  return Math.abs(scaled - Math.round(scaled)) < TOLERANCE;
}

// Digits with an optional decimal part, separated by a comma or a point.
const AMOUNT_TEXT = /^\d+([.,]\d+)?$/;

/**
 * Reads an amount typed by the user: "1,25" or "1.25". Returns null if `text` is not a number
 * of that form. It does not check the decimals or the sign: that is up to the rules of each
 * amount.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  return AMOUNT_TEXT.test(trimmed) ? Number(trimmed.replace(",", ".")) : null;
}
