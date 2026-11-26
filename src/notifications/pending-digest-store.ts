// Remembers on the device what the user chose for the pending digest (RF-37): whether it is on
// and at what time. Like the gesture hint, it is not data of the account, so it does not
// synchronize and survives signing out. It lives outside the database for the same reason: a
// migration would stop the app from starting if an over-the-air update that added it were
// rolled back.

import Storage from "expo-sqlite/kv-store";

import {
  DEFAULT_PENDING_DIGEST,
  type PendingDigestSettings,
} from "@/domain/digests";
import { parseLocalTime } from "@/domain/times";

const ENABLED_KEY = "pendingDigest.enabled";
const TIME_KEY = "pendingDigest.time";

/**
 * What the user chose. What was never chosen, or cannot be understood, is the default. If it
 * cannot be read at all, the default too: a digest at the default time is better than none.
 */
export async function readPendingDigestSettings(): Promise<PendingDigestSettings> {
  try {
    const [enabled, time] = await Promise.all([
      Storage.getItem(ENABLED_KEY),
      Storage.getItem(TIME_KEY),
    ]);
    return {
      enabled:
        enabled === null ? DEFAULT_PENDING_DIGEST.enabled : enabled !== "false",
      time: parseLocalTime(time ?? "") ?? DEFAULT_PENDING_DIGEST.time,
    };
  } catch (error) {
    console.warn("The pending digest settings could not be read.", error);
    return DEFAULT_PENDING_DIGEST;
  }
}

/**
 * Remembers what the user chose. Unlike the gesture hint, it fails if it cannot be saved: the
 * settings would otherwise show a choice that the digest does not follow.
 */
export async function savePendingDigestSettings(
  settings: PendingDigestSettings,
): Promise<void> {
  await Promise.all([
    Storage.setItem(ENABLED_KEY, String(settings.enabled)),
    Storage.setItem(TIME_KEY, settings.time),
  ]);
}
