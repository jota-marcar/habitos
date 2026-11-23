import { SYNC_TIME_LIMIT_MS, refreshAndSync } from "./background-refresh";

function recorder() {
  const log: string[] = [];
  return {
    log,
    refresh: async () => {
      log.push("refresh");
    },
  };
}

describe("refreshAndSync", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("refreshes before synchronizing, and again with what it brought", async () => {
    const { log, refresh } = recorder();

    await refreshAndSync(refresh, async () => {
      log.push("sync");
    });

    expect(log).toEqual(["refresh", "sync", "refresh"]);
  });

  test("does not wait for a synchronization past the time limit", async () => {
    const { log, refresh } = recorder();
    const never = new Promise<void>(() => undefined);

    const done = refreshAndSync(refresh, () => never);
    await jest.advanceTimersByTimeAsync(SYNC_TIME_LIMIT_MS - 1);
    expect(log).toEqual(["refresh"]);

    await jest.advanceTimersByTimeAsync(1);
    await done;

    expect(log).toEqual(["refresh", "refresh"]);
  });

  test("leaves no timer behind once the synchronization has ended", async () => {
    const { refresh } = recorder();

    await refreshAndSync(refresh, () => Promise.resolve());

    expect(jest.getTimerCount()).toBe(0);
  });

  test("has already refreshed if the synchronization fails", async () => {
    const { log, refresh } = recorder();

    await expect(
      refreshAndSync(refresh, () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");

    expect(log).toEqual(["refresh"]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
