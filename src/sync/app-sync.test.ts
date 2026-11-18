import type { Database } from "@/data/database";

import {
  onSyncedChanges,
  resumeSync,
  suspendSync,
  syncNow,
  syncSoon,
} from "./app-sync";
import { CHANGE_DELAY_MS } from "./scheduler";
import { synchronize } from "./synchronize";

const mockGetSession = jest.fn();
jest.mock("@/auth/supabase", () => ({
  supabase: () => ({ auth: { getSession: mockGetSession } }),
}));
jest.mock("./supabase-remote", () => ({ supabaseRemote: () => "remote" }));
jest.mock("./synchronize", () => ({ synchronize: jest.fn() }));

const mockSynchronize = jest.mocked(synchronize);
const db = {} as Database;

function signedIn(userId: string) {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: userId } } },
    error: null,
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  mockGetSession.mockReset();
  mockSynchronize.mockReset();
  mockSynchronize.mockResolvedValue({ changed: false });
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

test("synchronizes the database with the account of the session", async () => {
  signedIn("user-1");

  await syncNow(db);

  expect(mockSynchronize).toHaveBeenCalledWith(db, "remote", "user-1");
});

test("does nothing without a session", async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

  await syncNow(db);

  expect(mockSynchronize).not.toHaveBeenCalled();
});

test("tells the listeners when the data on the device changed", async () => {
  signedIn("user-1");
  const listener = jest.fn();
  const stop = onSyncedChanges(listener);

  await syncNow(db);
  expect(listener).not.toHaveBeenCalled();

  mockSynchronize.mockResolvedValue({ changed: true });
  await syncNow(db);
  expect(listener).toHaveBeenCalledTimes(1);

  stop();
  await syncNow(db);
  expect(listener).toHaveBeenCalledTimes(1);
});

test("a session that cannot be read is reported, and never fails", async () => {
  jest.useFakeTimers();
  try {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error("Refresh token not found"),
    });

    await expect(syncNow(db)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      "The data could not be synchronized.",
      new Error("Refresh token not found"),
    );
    // Its retry waits until the next test, which resets the timers.
    signedIn("user-1");
    await syncNow(db);
  } finally {
    jest.useRealTimers();
  }
});

test("a local change synchronizes in a moment", async () => {
  jest.useFakeTimers();
  try {
    signedIn("user-1");

    syncSoon(db);
    expect(mockSynchronize).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(CHANGE_DELAY_MS);

    expect(mockSynchronize).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test("does not synchronize while suspended", async () => {
  signedIn("user-1");

  await suspendSync();
  await syncNow(db);
  expect(mockSynchronize).not.toHaveBeenCalled();

  resumeSync();
  await syncNow(db);
  expect(mockSynchronize).toHaveBeenCalled();
});
