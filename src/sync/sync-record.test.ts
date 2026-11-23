import Storage from "expo-sqlite/kv-store";

import {
  clearSyncRecord,
  readSyncRecord,
  recordSyncFailure,
  recordSyncSuccess,
} from "./sync-record";

const mockStore = new Map<string, string>();
jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => mockStore.delete(key)),
  },
}));

let warn: jest.SpyInstance;

beforeEach(() => {
  mockStore.clear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("the record of the synchronizations", () => {
  test("starts empty", async () => {
    expect(await readSyncRecord()).toEqual({
      lastCopiedAt: null,
      failingSince: null,
    });
  });

  test("a success remembers its moment and ends the failures", async () => {
    await recordSyncFailure(100);

    await recordSyncSuccess(200);

    expect(await readSyncRecord()).toEqual({
      lastCopiedAt: 200,
      failingSince: null,
    });
  });

  test("failures keep the moment of the first one", async () => {
    await recordSyncSuccess(50);

    await recordSyncFailure(100);
    await recordSyncFailure(200);

    expect(await readSyncRecord()).toEqual({
      lastCopiedAt: 50,
      failingSince: 100,
    });
  });

  test("clearing forgets everything", async () => {
    await recordSyncSuccess(50);
    await recordSyncFailure(100);

    await clearSyncRecord();

    expect(await readSyncRecord()).toEqual({
      lastCopiedAt: null,
      failingSince: null,
    });
  });

  test("a value that is not a number counts as nothing", async () => {
    mockStore.set("sync.lastCopiedAt", "yesterday");

    expect((await readSyncRecord()).lastCopiedAt).toBeNull();
  });

  test("if it cannot be read, there is nothing to show", async () => {
    jest.mocked(Storage.getItem).mockRejectedValueOnce(new Error("no"));

    expect(await readSyncRecord()).toEqual({
      lastCopiedAt: null,
      failingSince: null,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("if it cannot be saved, it does not fail", async () => {
    jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error("no"));

    await expect(recordSyncSuccess(100)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
