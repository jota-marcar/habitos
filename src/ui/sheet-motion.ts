// How the sheets move under the finger (ADR-0010). Every threshold of the gestures lives here,
// so that their feel can be tuned after trying them on the iPhone. The functions are worklets:
// they run on the UI thread, inside the gesture callbacks.
//
// Distances are in points and speeds in points per second. "Towards open" is positive.

/** Vertical travel before a drag starts to move a sheet. */
export const ACTIVATION_DISTANCE = 10;

/** Horizontal travel that cancels a drag before it starts: sideways is kept for RF-33. */
export const HORIZONTAL_FAIL_DISTANCE = 20;

/** Share of its height a sheet must be dragged to open or close when let go slowly. */
export const DRAG_FRACTION = 0.3;

/** Speed above which letting go opens or closes the sheet, whatever the distance. */
export const FLING_VELOCITY = 500;

/** Opacity of the backdrop when the sheet is fully open. */
export const BACKDROP_OPACITY = 0.3;

/** A critically damped spring: no bounce, and it carries on with the speed of the finger. */
export const SPRING = {
  mass: 1,
  stiffness: 300,
  damping: 35,
  overshootClamping: true,
} as const;

// How much a sheet resists being pulled past fully open, like the scroll views of iOS.
const RUBBER_BAND = 0.55;

/**
 * Whether a sheet ends open when the finger lets go. A fast flick wins; otherwise the sheet
 * must have travelled `DRAG_FRACTION` of its height away from where it started.
 */
export function settlesOpen(
  wasOpen: boolean,
  travel: number,
  velocity: number,
  height: number,
): boolean {
  "worklet";
  if (velocity > FLING_VELOCITY) return true;
  if (velocity < -FLING_VELOCITY) return false;
  const threshold = height * DRAG_FRACTION;
  return wasOpen ? travel > -threshold : travel > threshold;
}

/**
 * The visible height of a sheet for a drag that would show `raw` points of it: never below 0,
 * and past its full height with growing resistance.
 */
export function visibleHeight(raw: number, height: number): number {
  "worklet";
  if (raw <= 0) return 0;
  if (raw <= height || height <= 0) return raw;
  const excess = raw - height;
  return height + (1 - 1 / ((excess * RUBBER_BAND) / height + 1)) * height;
}
