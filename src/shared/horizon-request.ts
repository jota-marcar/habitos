// The page the main screen has to show because a notification was tapped (RF-26, RF-37, RF-49,
// RF-63).
// The tap may arrive before the screen exists, when it is what starts the app, so the request
// waits here until the screen is there to take it.

/** The pages of the main screen, in the order they are swiped through. */
export const HORIZONS = ["habits", "weekly", "longTerm"] as const;
export type Horizon = (typeof HORIZONS)[number];

let requested: Horizon | null = null;
let listener: ((horizon: Horizon) => void) | null = null;

/** Asks the main screen to show `horizon`, now or as soon as it is there. */
export function requestHorizon(horizon: Horizon): void {
  if (listener === null) requested = horizon;
  else listener(horizon);
}

/** The horizon waiting for the main screen, if any. It stays there until it is listened to. */
export function requestedHorizon(): Horizon | null {
  return requested;
}

/** Calls `next` with each request, starting with the one waiting. Returns how to stop. */
export function listenToHorizonRequests(
  next: (horizon: Horizon) => void,
): () => void {
  listener = next;
  if (requested !== null) {
    const waiting = requested;
    requested = null;
    next(waiting);
  }
  return () => {
    if (listener === next) listener = null;
  };
}
