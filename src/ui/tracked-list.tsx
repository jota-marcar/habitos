// The list of a page of the main screen: the habits of a day (RF-12) or the goals of a week
// (RF-46). What is pending sits at the top and what is done at the bottom, with the free space
// between them. An item that was done or undone slides to its group, after a pause in the taps.

import { useEffect, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { progressOf } from "@/domain/day";
import type { Amounts, HabitColor, HabitType } from "@/domain/habits";
import type { DayGroups } from "@/domain/order";

import { formatProgress } from "./format";
import { PROGRESS_DOT_SIZE, ProgressDot } from "./progress-dot";
import { fontSize, spacing, useColors } from "./theme";
import { SETTLE_DELAY_MS } from "./use-day";

// A done item is dimmed (RF-13), gradually during the pause before it moves to its group
// (RF-12). With Reduce Motion on, it changes at once.
const DONE_OPACITY = 0.4;

// How an item slides to its group, and the others make room for it (RF-12). It is brief, and
// with Reduce Motion on, iOS skips it.
const MOVE = LinearTransition.duration(350).easing(Easing.inOut(Easing.quad));

// The least space between the two groups, when they fill the box and it scrolls (RF-12).
const GROUP_GAP = spacing.xl;

/** What a row shows of a habit or a goal. */
export interface TrackedItem {
  readonly id: string;
  readonly name: string;
  readonly type: HabitType;
  readonly color: HabitColor | null;
  readonly amounts: Amounts;
  readonly value: number;
  readonly done: boolean;
}

function TrackedRow({
  item,
  rowPrefix,
  showColor,
  onPress,
  onLongPress,
}: {
  item: TrackedItem;
  /** The start of the test id of the row. */
  rowPrefix: string;
  /** Whether the rows of the list have a dot with their color and progress (RF-13). */
  showColor: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colors = useColors();
  const { id, name, type, color, amounts, value, done } = item;
  const boolean = type === "boolean";
  const progress = boolean ? null : formatProgress(value, amounts);

  const targetOpacity = done ? DONE_OPACITY : 1;
  const opacity = useSharedValue(targetOpacity);
  useEffect(() => {
    opacity.set(withTiming(targetOpacity, { duration: SETTLE_DELAY_MS }));
  }, [opacity, targetOpacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View testID={`fade-${id}`} style={fadeStyle}>
      <Pressable
        testID={`${rowPrefix}-${id}`}
        accessibilityRole={boolean ? "checkbox" : "button"}
        accessibilityState={boolean ? { checked: done } : undefined}
        accessibilityLabel={name}
        accessibilityValue={progress === null ? undefined : { text: progress }}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.label}>
          {/* An item without a color leaves the room of the dot empty, so that the names line up. */}
          {!showColor ? null : color === null ? (
            <View testID={`no-color-${id}`} style={styles.noDot} />
          ) : (
            <ProgressDot
              testID={`color-dot-${id}`}
              color={colors.habit[color]}
              progress={progressOf(type, amounts, value)}
            />
          )}
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {name}
          </Text>
        </View>
        {progress === null ? null : (
          <Text style={[styles.progress, { color: colors.textSecondary }]}>
            {progress}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Separator() {
  const colors = useColors();
  return (
    <View style={[styles.separator, { backgroundColor: colors.border }]} />
  );
}

type ListScrollProps = Pick<
  ComponentProps<typeof ScrollView>,
  "simultaneousWith" | "onScroll"
>;

export function TrackedList<T>({
  testID,
  rowPrefix,
  groups,
  itemOf,
  onPress,
  onLongPress,
  simultaneousWith,
  onScroll,
}: {
  testID: string;
  rowPrefix: string;
  groups: DayGroups<T>;
  itemOf: (entry: T) => TrackedItem;
  onPress: (entry: T) => void;
  onLongPress: (entry: T) => void;
} & ListScrollProps) {
  // The dots only appear on a list with some item that has a color (RF-13).
  const showColor = [...groups.pending, ...groups.done].some(
    (entry) => itemOf(entry).color !== null,
  );

  // A row with the line that separates it from the one above, unless it is the first of its
  // group. The two groups are in the same container, so that a row that changes group keeps
  // its view and slides from one place to the other.
  const renderRow = (entry: T, index: number) => {
    const item = itemOf(entry);
    return (
      <Animated.View key={item.id} layout={MOVE}>
        {index === 0 ? null : <Separator />}
        <TrackedRow
          item={item}
          rowPrefix={rowPrefix}
          showColor={showColor}
          onPress={() => onPress(entry)}
          onLongPress={() => onLongPress(entry)}
        />
      </Animated.View>
    );
  };

  return (
    <ScrollView
      testID={testID}
      // The drag that opens the calendar goes along with the scroll of the list.
      simultaneousWith={simultaneousWith}
      // A list that fits does not move, so pulling it down only brings the calendar.
      alwaysBounceVertical={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // The list fills the box, and the gap between the groups takes the space left, which
      // pushes the done group to the bottom.
      contentContainerStyle={styles.groups}
    >
      {/* A single list: with one per group, a row that changes group would be a new view,
          which appears in its place instead of sliding there. */}
      {[
        ...groups.pending.map(renderRow),
        <View key="gap" testID={`${testID}-gap`} style={styles.groupGap} />,
        ...groups.done.map(renderRow),
      ]}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - spacing.xs,
  },
  pressed: { opacity: 0.6 },
  label: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm + 2,
  },
  noDot: { height: PROGRESS_DOT_SIZE, width: PROGRESS_DOT_SIZE },
  name: { flexShrink: 1, fontSize: fontSize.list },
  progress: { fontSize: fontSize.list, fontVariant: ["tabular-nums"] },
  groups: { flexGrow: 1 },
  groupGap: { flexGrow: 1, minHeight: GROUP_GAP },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md,
  },
});
