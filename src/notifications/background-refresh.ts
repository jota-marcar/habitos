// What the task in the background does (ADR-0005, ADR-0018), apart from iOS so that it can be
// tested. iOS gives the task little time, and keeping the reminders going is what it is for.

/** How long the task waits for the synchronization, which a slow network can hold up. */
export const SYNC_TIME_LIMIT_MS = 20_000;

/**
 * Refreshes the reminders first, so that a slow network cannot leave them without refreshing.
 * Then synchronizes, for a limited time, and refreshes again with whatever it brought: a habit
 * done on another device has no reminders left here.
 */
export async function refreshAndSync(
  refresh: () => Promise<void>,
  sync: () => Promise<void>,
  timeLimitMs: number = SYNC_TIME_LIMIT_MS,
): Promise<void> {
  await refresh();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeLimitMs);
  });
  await Promise.race([sync(), timeLimit]).finally(() => clearTimeout(timer));

  await refresh();
}
