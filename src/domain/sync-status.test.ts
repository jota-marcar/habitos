import { STUCK_AFTER_DAYS, syncStatusOf } from "./sync-status";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

describe("syncStatusOf", () => {
  test("with nothing copied and nothing waiting there is nothing to say", () => {
    expect(
      syncStatusOf({ lastCopiedAt: null, failingSince: null }, false, NOW),
    ).toEqual({ kind: "none" });
  });

  test("with nothing waiting, says when it was last copied", () => {
    const at = NOW - DAY;

    expect(
      syncStatusOf({ lastCopiedAt: at, failingSince: null }, false, NOW),
    ).toEqual({ kind: "copied", at });
  });

  test("a failure with nothing waiting loses nothing", () => {
    const at = NOW - 10 * DAY;

    expect(
      syncStatusOf({ lastCopiedAt: at, failingSince: at }, false, NOW),
    ).toEqual({ kind: "copied", at });
  });

  test("changes that have not failed are just pending", () => {
    expect(
      syncStatusOf(
        { lastCopiedAt: NOW - 30 * DAY, failingSince: null },
        true,
        NOW,
      ),
    ).toEqual({ kind: "pending" });
  });

  test("changes failing for less than the limit are still pending", () => {
    const failingSince = NOW - STUCK_AFTER_DAYS * DAY + 1;

    expect(
      syncStatusOf({ lastCopiedAt: null, failingSince }, true, NOW),
    ).toEqual({ kind: "pending" });
  });

  test("changes failing for the limit or more are stuck, with the days", () => {
    expect(STUCK_AFTER_DAYS).toBe(3);
    expect(
      syncStatusOf(
        { lastCopiedAt: null, failingSince: NOW - STUCK_AFTER_DAYS * DAY },
        true,
        NOW,
      ),
    ).toEqual({ kind: "stuck", days: 3 });
    expect(
      syncStatusOf(
        { lastCopiedAt: NOW - 20 * DAY, failingSince: NOW - 7.5 * DAY },
        true,
        NOW,
      ),
    ).toEqual({ kind: "stuck", days: 7 });
  });
});
