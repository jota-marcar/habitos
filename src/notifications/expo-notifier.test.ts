import type { NotificationResponse } from "expo-notifications";

import { tappedHorizon } from "./expo-notifier";

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "tap",
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));

function response(identifier: string, actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: { request: { identifier } },
  } as unknown as NotificationResponse;
}

describe("tappedHorizon", () => {
  test("tapping a progress digest opens the weekly page (RF-49)", () => {
    expect(tappedHorizon(response("progress.2026-11-12.20:00", "tap"))).toBe(
      "weekly",
    );
  });

  test("tapping a reminder or a pending digest opens the habits (RF-26, RF-37)", () => {
    expect(tappedHorizon(response("reminder.r1.2026-11-12", "tap"))).toBe(
      "habits",
    );
    expect(tappedHorizon(response("digest.2026-11-12.17:00", "tap"))).toBe(
      "habits",
    );
  });

  test("a button acts without moving the screen (RF-25)", () => {
    expect(
      tappedHorizon(response("reminder.r1.2026-11-12", "done")),
    ).toBeNull();
  });
});
