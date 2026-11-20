// The circle before the name of a habit with a color: its outline, filled like a clock from
// twelve o'clock as the progress of the day goes up, full when the goal is met (RF-13).

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Across, in points. */
export const PROGRESS_DOT_SIZE = 14;

const BORDER_WIDTH = 1.5;
const FILL_DURATION = 250;

/**
 * How far each half of the fill turns, in degrees, for a progress from 0 to 1. The right half
 * turns first, from twelve to six o'clock; the left half, from six back to twelve.
 */
export function fillRotations(progress: number): {
  right: number;
  left: number;
} {
  "worklet";
  const degrees = Math.min(Math.max(progress, 0), 1) * 360;
  return { right: Math.min(degrees, 180), left: Math.max(degrees - 180, 0) };
}

/**
 * Each half of the circle shows, through a clip, a half disc that turns around the centre: it
 * starts hidden on the other side of the clip and comes into view as it turns.
 */
export function ProgressDot({
  color,
  progress,
  testID,
}: {
  color: string;
  progress: number;
  testID?: string;
}) {
  const shown = useSharedValue(progress);
  useEffect(() => {
    shown.set(withTiming(progress, { duration: FILL_DURATION }));
  }, [progress, shown]);

  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fillRotations(shown.get()).right}deg` }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fillRotations(shown.get()).left}deg` }],
  }));
  // Once full, a whole disc covers the line where the two halves meet.
  const fullStyle = useAnimatedStyle(() => ({
    opacity: shown.get() >= 1 ? 1 : 0,
  }));

  return (
    <View testID={testID} style={[styles.ring, { borderColor: color }]}>
      <View style={[styles.clip, styles.rightClip]}>
        <Animated.View
          testID={testID && `${testID}-right`}
          style={[styles.disc, styles.rightDisc, rightStyle]}
        >
          <View style={[styles.half, { backgroundColor: color }]} />
        </Animated.View>
      </View>
      <View style={[styles.clip, styles.leftClip]}>
        <Animated.View
          testID={testID && `${testID}-left`}
          style={[styles.disc, styles.leftDisc, leftStyle]}
        >
          <View style={[styles.half, styles.end, { backgroundColor: color }]} />
        </Animated.View>
      </View>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: color }, fullStyle]}
      />
    </View>
  );
}

const HALF = PROGRESS_DOT_SIZE / 2;

const styles = StyleSheet.create({
  ring: {
    borderRadius: HALF,
    borderWidth: BORDER_WIDTH,
    height: PROGRESS_DOT_SIZE,
    overflow: "hidden",
    width: PROGRESS_DOT_SIZE,
  },
  // The clips and discs are placed against the outer edge, over the border.
  clip: {
    height: PROGRESS_DOT_SIZE,
    overflow: "hidden",
    position: "absolute",
    top: -BORDER_WIDTH,
    width: HALF,
  },
  rightClip: { left: HALF - BORDER_WIDTH },
  leftClip: { left: -BORDER_WIDTH },
  // As big as the circle and centred on it, so that it turns around its centre.
  disc: {
    flexDirection: "row",
    height: PROGRESS_DOT_SIZE,
    position: "absolute",
    top: 0,
    width: PROGRESS_DOT_SIZE,
  },
  // Its colored half starts on the left, hidden from the right clip.
  rightDisc: { left: -HALF },
  // Its colored half starts on the right, hidden from the left clip.
  leftDisc: { left: 0 },
  half: { height: PROGRESS_DOT_SIZE, width: HALF },
  end: { marginLeft: HALF },
});
