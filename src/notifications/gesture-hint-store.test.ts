import Storage from "expo-sqlite/kv-store";

import { localDate } from "@/domain/dates";

import {
  markGestureLearned,
  readGestureHint,
  startGestureHint,
} from "./gesture-hint-store";
import { NO_GESTURE_HINT } from "./planner";

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

describe("readGestureHint", () => {
  test("with nothing saved, the hint has not started", async () => {
    stored({});

    expect(await readGestureHint()).toEqual({
      startedOn: null,
      learned: false,
    });
  });

  test("reads the day it started and whether it was learned", async () => {
    stored({
      "gestureHint.startedOn": "2026-11-12",
      "gestureHint.learned": "true",
    });

    expect(await readGestureHint()).toEqual({
      startedOn: localDate("2026-11-12"),
      learned: true,
    });
  });

  test("if it cannot be read, the hint is not shown", async () => {
    jest.mocked(Storage.getItem).mockRejectedValue(new Error("broken"));

    expect(await readGestureHint()).toEqual(NO_GESTURE_HINT);
    expect(warn).toHaveBeenCalled();
  });
});

describe("saving", () => {
  test("remembers the day the hint started", async () => {
    await startGestureHint(localDate("2026-11-12"));

    expect(Storage.setItem).toHaveBeenCalledWith(
      "gestureHint.startedOn",
      "2026-11-12",
    );
  });

  test("remembers that the gesture was learned", async () => {
    await markGestureLearned();

    expect(Storage.setItem).toHaveBeenCalledWith("gestureHint.learned", "true");
  });

  test("a failure to save never reaches the caller", async () => {
    jest.mocked(Storage.setItem).mockRejectedValue(new Error("full"));

    await expect(
      startGestureHint(localDate("2026-11-12")),
    ).resolves.toBeUndefined();
    await expect(markGestureLearned()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
