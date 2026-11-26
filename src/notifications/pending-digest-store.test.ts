import Storage from "expo-sqlite/kv-store";

import { DEFAULT_PENDING_DIGEST } from "@/domain/digests";
import { localTime } from "@/domain/times";

import {
  readPendingDigestSettings,
  savePendingDigestSettings,
} from "./pending-digest-store";

jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const stored = (values: Record<string, string>) =>
  jest
    .mocked(Storage.getItem)
    .mockImplementation(async (key: string) => values[key] ?? null);

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Storage.setItem).mockResolvedValue(undefined);
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe("readPendingDigestSettings", () => {
  test("with nothing saved, it is the default", async () => {
    stored({});

    expect(await readPendingDigestSettings()).toEqual(DEFAULT_PENDING_DIGEST);
  });

  test("reads whether it is on and its time", async () => {
    stored({ "pendingDigest.enabled": "false", "pendingDigest.time": "19:30" });

    expect(await readPendingDigestSettings()).toEqual({
      enabled: false,
      time: localTime("19:30"),
    });
  });

  test("a time it cannot understand is the default one", async () => {
    stored({ "pendingDigest.enabled": "true", "pendingDigest.time": "25:00" });

    expect(await readPendingDigestSettings()).toEqual(DEFAULT_PENDING_DIGEST);
  });

  test("if it cannot be read, it is the default", async () => {
    jest.mocked(Storage.getItem).mockRejectedValue(new Error("broken"));

    expect(await readPendingDigestSettings()).toEqual(DEFAULT_PENDING_DIGEST);
    expect(warn).toHaveBeenCalled();
  });
});

describe("savePendingDigestSettings", () => {
  test("saves whether it is on and its time", async () => {
    await savePendingDigestSettings({
      enabled: false,
      time: localTime("07:15"),
    });

    expect(Storage.setItem).toHaveBeenCalledWith(
      "pendingDigest.enabled",
      "false",
    );
    expect(Storage.setItem).toHaveBeenCalledWith("pendingDigest.time", "07:15");
  });

  test("fails if it cannot be saved", async () => {
    jest.mocked(Storage.setItem).mockRejectedValue(new Error("full"));

    await expect(
      savePendingDigestSettings(DEFAULT_PENDING_DIGEST),
    ).rejects.toThrow("full");
  });
});
