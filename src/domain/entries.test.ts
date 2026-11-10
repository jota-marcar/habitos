import { localDate } from "./dates";
import {
  canRecordOn,
  decremented,
  exactAmount,
  incremented,
  toggled,
} from "./entries";

describe("canRecordOn", () => {
  const today = localDate("2026-10-28");

  test("today can be recorded", () => {
    expect(canRecordOn(today, today)).toBe(true);
  });

  test("past days can be recorded with no age limit (RF-19)", () => {
    expect(canRecordOn(localDate("2026-10-27"), today)).toBe(true);
    expect(canRecordOn(localDate("2020-01-01"), today)).toBe(true);
  });

  test("future days cannot be recorded (RF-20)", () => {
    expect(canRecordOn(localDate("2026-10-29"), today)).toBe(false);
  });
});

describe("toggled", () => {
  test("marks a pending habit and unmarks a done one (RF-14)", () => {
    expect(toggled(0)).toBe(1);
    expect(toggled(1)).toBe(0);
  });
});

describe("incremented", () => {
  test("adds the increment (RF-15)", () => {
    expect(incremented(0, 0.25)).toBe(0.25);
    expect(incremented(1.25, 0.25)).toBe(1.5);
  });

  test("does not accumulate floating-point error", () => {
    let value = 0;
    for (let i = 0; i < 10; i++) value = incremented(value, 0.1);
    expect(value).toBe(1);
  });

  test("can exceed the target: there is no upper limit (RF-16)", () => {
    expect(incremented(2, 0.25)).toBe(2.25);
  });
});

describe("decremented", () => {
  test("subtracts the increment (RF-15)", () => {
    expect(decremented(1.5, 0.25)).toBe(1.25);
    expect(decremented(0.3, 0.1)).toBe(0.2);
  });

  test("never goes below 0", () => {
    expect(decremented(0.25, 0.25)).toBe(0);
    expect(decremented(0.1, 0.25)).toBe(0);
    expect(decremented(0, 1)).toBe(0);
  });
});

describe("exactAmount", () => {
  test.each([0, 1, 1.25, 250])("accepts %d", (value) => {
    expect(exactAmount(value)).toEqual({ ok: true, value });
  });

  test("rejects a negative amount", () => {
    expect(exactAmount(-1)).toEqual({ ok: false, errors: ["amount_negative"] });
  });

  test("rejects an amount with more than 2 decimals", () => {
    expect(exactAmount(1.234)).toEqual({
      ok: false,
      errors: ["amount_too_precise"],
    });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects %d", (value) => {
    expect(exactAmount(value)).toEqual({
      ok: false,
      errors: ["amount_invalid"],
    });
  });
});
