// Says that a change could not be saved on the device (RF-53), instead of letting the user
// believe it was.

import { Alert } from "react-native";

// Several quick taps that fail are one problem, not a dialog each.
const QUIET_MS = 3_000;
let lastShownAt = Number.NEGATIVE_INFINITY;

export function reportWriteFailure(error: unknown): void {
  console.warn("A change could not be saved.", error);
  const shownAt = Date.now();
  if (shownAt - lastShownAt < QUIET_MS) return;
  lastShownAt = shownAt;
  Alert.alert(
    "No se ha podido guardar",
    "Tu último cambio no se ha guardado. Inténtalo de nuevo.",
  );
}
