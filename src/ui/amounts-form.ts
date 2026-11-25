// The type and the amounts as a form holds them, the same in every form: what the user typed,
// and its conversion from and into the amounts the domain checks.

import { parseAmount } from "@/domain/amounts";
import {
  DEFAULT_INCREMENT,
  type Amounts,
  type TrackedType,
} from "@/domain/tracked";

import { formatAmount } from "@/shared/format";

export interface AmountValues {
  readonly type: TrackedType;
  /** The amounts as typed, so that "1," can be shown while typing "1,5". */
  readonly target: string;
  readonly unit: string;
  readonly increment: string;
}

export const EMPTY_AMOUNTS: AmountValues = {
  type: "boolean",
  target: "",
  unit: "",
  increment: formatAmount(DEFAULT_INCREMENT),
};

/**
 * The amounts typed in the form, for an item of `type`. A boolean one has none, even if they
 * were typed before changing the type; text that is not a number is rejected like a missing
 * amount.
 */
export function amountsOf(
  type: TrackedType,
  values: Omit<AmountValues, "type">,
): Amounts {
  const quantitative = type === "quantitative";
  return {
    target: quantitative ? parseAmount(values.target) : null,
    unit: quantitative ? values.unit : null,
    increment: quantitative ? parseAmount(values.increment) : null,
  };
}

/** The form filled in with an item of `type` and its amounts. */
export function amountValuesOf(
  type: TrackedType,
  amounts: Amounts,
): AmountValues {
  const amount = (value: number | null, missing: string) =>
    value === null ? missing : formatAmount(value);
  return {
    type,
    target: amount(amounts.target, EMPTY_AMOUNTS.target),
    unit: amounts.unit ?? EMPTY_AMOUNTS.unit,
    increment: amount(amounts.increment, EMPTY_AMOUNTS.increment),
  };
}
