import { render, screen } from "@testing-library/react-native";

import { fillRotations, ProgressDot } from "./progress-dot";

describe("fillRotations", () => {
  test("nothing turns with no progress", () => {
    expect(fillRotations(0)).toEqual({ right: 0, left: 0 });
  });

  test("the right half fills first, up to half the goal", () => {
    expect(fillRotations(0.25)).toEqual({ right: 90, left: 0 });
    expect(fillRotations(0.5)).toEqual({ right: 180, left: 0 });
  });

  test("then the left half, up to the whole goal", () => {
    expect(fillRotations(0.75)).toEqual({ right: 180, left: 90 });
    expect(fillRotations(1)).toEqual({ right: 180, left: 180 });
  });

  test("stays within an empty and a full circle", () => {
    expect(fillRotations(-1)).toEqual({ right: 0, left: 0 });
    expect(fillRotations(2)).toEqual({ right: 180, left: 180 });
  });
});

describe("ProgressDot", () => {
  test("is an outline of the color, filled up to the progress", async () => {
    await render(<ProgressDot testID="dot" color="#2DD4BF" progress={0.75} />);

    expect(screen.getByTestId("dot")).toHaveStyle({ borderColor: "#2DD4BF" });
    expect(screen.getByTestId("dot-right")).toHaveStyle({
      transform: [{ rotate: "180deg" }],
    });
    expect(screen.getByTestId("dot-left")).toHaveStyle({
      transform: [{ rotate: "90deg" }],
    });
  });
  // How it fills when the progress changes is an animation, which these tests cannot follow:
  // the Reanimated of the tests (the web one, see jest.config.js) moves it outside React.
});
