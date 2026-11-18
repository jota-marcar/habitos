// When the synchronization runs (ADR-0018): never two at once, the requests that arrive while
// one runs grouped into one more run, local changes grouped for a moment before uploading
// them, and a failed run retried later with growing waits. There is no listener of the
// connection: a run that fails without it is retried, and coming back to the app runs again.

/** The waits before retrying a failed run: the first, the second, and from then on, the last. */
export const RETRY_DELAYS_MS: readonly number[] = [
  30_000, 60_000, 120_000, 300_000,
];

/** How long a local change waits for the next ones before uploading them together. */
export const CHANGE_DELAY_MS = 2_000;

export interface SyncScheduler {
  /**
   * Runs as soon as possible. The promise ends when a run that started after the request
   * ends, whether it succeeded or not.
   */
  request(): Promise<void>;
  /** Runs in a moment, together with the changes that come meanwhile. */
  requestSoon(): void;
  /**
   * Stops running until `resume`, and waits for the run in progress to end. The requests that
   * arrive meanwhile run on resuming.
   */
  suspend(): Promise<void>;
  resume(): void;
}

export function createSyncScheduler(
  run: () => Promise<void>,
  onError: (error: unknown) => void,
): SyncScheduler {
  let running: Promise<void> | null = null;
  let again = false;
  let suspended = false;
  let requestedWhileSuspended = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const later = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void request();
    }, delay);
  };

  const runOnce = async () => {
    try {
      await run();
      failures = 0;
    } catch (error) {
      onError(error);
      later(RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]);
      failures += 1;
    }
  };

  const loop = async () => {
    do {
      again = false;
      // This run takes the place of a pending one.
      clearTimer();
      await runOnce();
    } while (again && !suspended);
    // A request that arrived while suspending runs on resuming.
    if (again) requestedWhileSuspended = true;
  };

  const request = (): Promise<void> => {
    if (suspended) {
      requestedWhileSuspended = true;
      return Promise.resolve();
    }
    clearTimer();
    if (running !== null) {
      again = true;
      return running;
    }
    running = loop().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    request,
    requestSoon: () => {
      if (suspended) requestedWhileSuspended = true;
      else later(CHANGE_DELAY_MS);
    },
    suspend: async () => {
      suspended = true;
      // A pending run is not lost: it runs on resuming.
      if (timer !== null) requestedWhileSuspended = true;
      clearTimer();
      await running;
    },
    resume: () => {
      suspended = false;
      if (requestedWhileSuspended) {
        requestedWhileSuspended = false;
        void request();
      }
    },
  };
}
