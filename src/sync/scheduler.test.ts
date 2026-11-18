import {
  CHANGE_DELAY_MS,
  RETRY_DELAYS_MS,
  createSyncScheduler,
  type SyncScheduler,
} from "./scheduler";

/** A run that waits until the test ends it. */
function controlledRun() {
  const calls: { finish: () => void; fail: (error: Error) => void }[] = [];
  const run = jest.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        calls.push({ finish: resolve, fail: reject });
      }),
  );
  return { run, calls };
}

let onError: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  onError = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Lets the pending promises go on. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("request", () => {
  test("runs at once, and the promise ends with the run", async () => {
    const run = jest.fn(async () => {});
    const scheduler = createSyncScheduler(run, onError);

    await scheduler.request();

    expect(run).toHaveBeenCalledTimes(1);
  });

  test("never runs twice at once: the requests meanwhile are one more run", async () => {
    const { run, calls } = controlledRun();
    const scheduler = createSyncScheduler(run, onError);

    const first = scheduler.request();
    const second = scheduler.request();
    const third = scheduler.request();
    expect(run).toHaveBeenCalledTimes(1);

    calls[0].finish();
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    calls[1].finish();
    await Promise.all([first, second, third]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("a failed run is reported and retried later, with growing waits", async () => {
    const run = jest.fn(async () => {
      throw new Error("offline");
    });
    const scheduler = createSyncScheduler(run, onError);

    await scheduler.request();
    expect(onError).toHaveBeenCalledWith(new Error("offline"));

    for (const [index, delay] of [
      ...RETRY_DELAYS_MS,
      RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1],
    ].entries()) {
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(run).toHaveBeenCalledTimes(index + 1);
      await jest.advanceTimersByTimeAsync(1);
      expect(run).toHaveBeenCalledTimes(index + 2);
    }
  });

  test("after a run that succeeds, the waits start again from the first", async () => {
    let fail = true;
    const run = jest.fn(async () => {
      if (fail) throw new Error("offline");
    });
    const scheduler = createSyncScheduler(run, onError);
    await scheduler.request();
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    fail = false;
    await scheduler.request();

    fail = true;
    await scheduler.request();
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(run).toHaveBeenCalledTimes(5);
  });

  test("a request takes the place of a pending retry", async () => {
    let fail = true;
    const run = jest.fn(async () => {
      if (fail) throw new Error("offline");
    });
    const scheduler = createSyncScheduler(run, onError);
    await scheduler.request();
    fail = false;

    await scheduler.request();
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("requestSoon", () => {
  test("waits for the next changes and runs once for all of them", async () => {
    const run = jest.fn(async () => {});
    const scheduler = createSyncScheduler(run, onError);

    scheduler.requestSoon();
    await jest.advanceTimersByTimeAsync(CHANGE_DELAY_MS - 1);
    scheduler.requestSoon();
    await jest.advanceTimersByTimeAsync(CHANGE_DELAY_MS - 1);
    expect(run).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("suspend", () => {
  let scheduler: SyncScheduler;
  let control: ReturnType<typeof controlledRun>;

  beforeEach(() => {
    control = controlledRun();
    scheduler = createSyncScheduler(control.run, onError);
  });

  test("waits for the run in progress", async () => {
    void scheduler.request();
    let suspended = false;
    void scheduler.suspend().then(() => {
      suspended = true;
    });
    await settle();
    expect(suspended).toBe(false);

    control.calls[0].finish();
    await settle();
    expect(suspended).toBe(true);
  });

  test("does not run until resuming, and then runs what was requested", async () => {
    await scheduler.suspend();

    await scheduler.request();
    scheduler.requestSoon();
    await jest.advanceTimersByTimeAsync(CHANGE_DELAY_MS);
    expect(control.run).not.toHaveBeenCalled();

    scheduler.resume();
    expect(control.run).toHaveBeenCalledTimes(1);
  });

  test("a request that arrived while suspending runs on resuming", async () => {
    void scheduler.request();
    void scheduler.request();
    const suspending = scheduler.suspend();
    control.calls[0].finish();
    await suspending;
    expect(control.run).toHaveBeenCalledTimes(1);

    scheduler.resume();
    expect(control.run).toHaveBeenCalledTimes(2);
  });

  test("resuming without requests does not run", async () => {
    await scheduler.suspend();

    scheduler.resume();

    expect(control.run).not.toHaveBeenCalled();
  });

  test("a pending run waits until resuming", async () => {
    scheduler.requestSoon();

    await scheduler.suspend();
    await jest.advanceTimersByTimeAsync(CHANGE_DELAY_MS);
    expect(control.run).not.toHaveBeenCalled();

    scheduler.resume();
    expect(control.run).toHaveBeenCalledTimes(1);
  });
});
