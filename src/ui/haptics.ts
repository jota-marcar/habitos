// Haptic feedback, with the generators of iOS itself, as its own apps use them:
// - a habit that is done by a tap gets the success notification, the one of a finished task;
// - any other tap that records something (adding without reaching the target, unmarking) gets
//   the selection tick, the subtlest one;
// - holding a habit to open its options gets a light impact, like a context menu of iOS.
// Nothing else vibrates: the sheets of iOS do not. iOS skips it all by itself when the system
// haptics are off, in Low Power Mode and while the camera or dictation are in use.

import * as Haptics from "expo-haptics";

/** What a tap on a habit did to it. */
export type RecordedFeedback = "done" | "changed";

export function recordedFeedback(
  wasDone: boolean,
  isDone: boolean,
): RecordedFeedback {
  return !wasDone && isDone ? "done" : "changed";
}

// Haptics are never essential: a failure is ignored.
const ignore = () => undefined;

export function playRecorded(feedback: RecordedFeedback): void {
  if (feedback === "done") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      ignore,
    );
  } else {
    Haptics.selectionAsync().catch(ignore);
  }
}

export function playOptionsOpened(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore);
}
