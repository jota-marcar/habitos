// Remembers on the device whether reminders still have to explain how to reach their buttons
// (RF-25). It is not data of the account, so it does not synchronize. It lives outside the
// database on purpose: a migration would stop the app from starting if an over-the-air update
// that added it were rolled back.

import Storage from "expo-sqlite/kv-store";

import { parseLocalDate, type LocalDate } from "@/domain/dates";
import type { GestureHint } from "@/domain/reminders";

import { NO_GESTURE_HINT } from "./planner";

const STARTED_ON_KEY = "gestureHint.startedOn";
const LEARNED_KEY = "gestureHint.learned";

/** What is remembered. If it cannot be read, the hint is simply not shown. */
export async function readGestureHint(): Promise<GestureHint> {
  try {
    const [startedOn, learned] = await Promise.all([
      Storage.getItem(STARTED_ON_KEY),
      Storage.getItem(LEARNED_KEY),
    ]);
    return {
      startedOn: parseLocalDate(startedOn ?? ""),
      learned: learned === "true",
    };
  } catch (error) {
    console.warn("The gesture hint could not be read.", error);
    return NO_GESTURE_HINT;
  }
}

/** Remembers the day the hint started. It never fails: the hint is not worth an error. */
export async function startGestureHint(date: LocalDate): Promise<void> {
  try {
    await Storage.setItem(STARTED_ON_KEY, date);
  } catch (error) {
    console.warn("The gesture hint could not be saved.", error);
  }
}

/** Remembers that the user has used a button. It never fails, like `startGestureHint`. */
export async function markGestureLearned(): Promise<void> {
  try {
    await Storage.setItem(LEARNED_KEY, "true");
  } catch (error) {
    console.warn("The gesture hint could not be saved.", error);
  }
}
