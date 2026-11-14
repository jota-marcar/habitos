import {
  DRAG_FRACTION,
  FLING_VELOCITY,
  settlesOpen,
  visibleHeight,
} from "./sheet-motion";

const height = 200;
const threshold = height * DRAG_FRACTION;

describe("settlesOpen", () => {
  test("opens a closed sheet dragged past the threshold", () => {
    expect(settlesOpen(false, threshold + 1, 0, height)).toBe(true);
    expect(settlesOpen(false, threshold, 0, height)).toBe(false);
  });

  test("closes an open sheet dragged down past the threshold", () => {
    expect(settlesOpen(true, -threshold + 1, 0, height)).toBe(true);
    expect(settlesOpen(true, -threshold, 0, height)).toBe(false);
  });

  test("a fast flick wins over the distance", () => {
    expect(settlesOpen(false, 5, FLING_VELOCITY + 1, height)).toBe(true);
    expect(settlesOpen(true, -5, -FLING_VELOCITY - 1, height)).toBe(false);
    expect(
      settlesOpen(false, threshold + 50, -FLING_VELOCITY - 1, height),
    ).toBe(false);
  });
});

describe("visibleHeight", () => {
  test("follows the finger between closed and fully open", () => {
    expect(visibleHeight(-30, height)).toBe(0);
    expect(visibleHeight(120, height)).toBe(120);
    expect(visibleHeight(height, height)).toBe(height);
  });

  test("resists more and more past fully open", () => {
    const a = visibleHeight(height + 50, height) - height;
    const b = visibleHeight(height + 100, height) - height;

    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(50);
    expect(b - a).toBeLessThan(a);
  });

  test("follows the finger while the height is still unknown", () => {
    expect(visibleHeight(40, 0)).toBe(40);
  });
});
