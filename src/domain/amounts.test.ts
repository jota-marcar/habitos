import { isAmount, roundAmount } from "./amounts";

describe("roundAmount", () => {
  test("removes the floating-point error of adding decimals", () => {
    expect(roundAmount(0.1 + 0.2)).toBe(0.3);
    expect(roundAmount(0.1 + 0.7)).toBe(0.8);
  });

  test("rounds to 2 decimals", () => {
    expect(roundAmount(1.234)).toBe(1.23);
    expect(roundAmount(1.235)).toBe(1.24);
    expect(roundAmount(1.005)).toBe(1.01);
  });

  test("leaves integers and valid amounts untouched", () => {
    expect(roundAmount(2)).toBe(2);
    expect(roundAmount(1.25)).toBe(1.25);
    expect(roundAmount(0)).toBe(0);
  });
});

describe("isAmount", () => {
  test.each([0, 1, 2.5, 1.25, 0.07, 0.01, 250, -1.5])("accepts %d", (value) => {
    expect(isAmount(value)).toBe(true);
  });

  test.each([1.234, 0.001, 1.005])(
    "rejects %d: more than 2 decimals",
    (value) => {
      expect(isAmount(value)).toBe(false);
    },
  );

  test("rejects values that are not finite numbers", () => {
    expect(isAmount(Number.NaN)).toBe(false);
    expect(isAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
