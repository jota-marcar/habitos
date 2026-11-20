import * as Haptics from "expo-haptics";

import { playOptionsOpened, playRecorded, recordedFeedback } from "./haptics";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
}));

const haptics = jest.mocked(Haptics);

beforeEach(() => jest.clearAllMocks());

describe("recordedFeedback", () => {
  test("a tap that does the habit is a finished task", () => {
    expect(recordedFeedback(false, true)).toBe("done");
  });

  test.each([
    ["adds without reaching the target", false, false],
    ["unmarks the habit", true, false],
    ["adds past the target", true, true],
  ])("a tap that %s is a change", (_, wasDone, isDone) => {
    expect(recordedFeedback(wasDone, isDone)).toBe("changed");
  });
});

describe("playRecorded", () => {
  test("a habit done gets the success notification of iOS", () => {
    playRecorded("done");
    expect(haptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
  });

  test("any other change gets the selection tick", () => {
    playRecorded("changed");
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test("a failure is ignored", async () => {
    haptics.selectionAsync.mockRejectedValueOnce(new Error("unavailable"));
    expect(() => playRecorded("changed")).not.toThrow();
    await Promise.resolve();
  });
});

describe("playOptionsOpened", () => {
  test("is a light impact, like a context menu of iOS", () => {
    playOptionsOpened();
    expect(haptics.impactAsync).toHaveBeenCalledWith("light");
  });
});
